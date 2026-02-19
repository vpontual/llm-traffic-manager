// Fleet poller -- polls all Ollama servers, records snapshots, detects changes

import { db } from "./db";
import { servers, serverSnapshots, modelEvents, systemMetrics, serverEvents } from "./schema";
import { pollServer, pollVllmServer, pollGenericServer } from "./ollama";
import { fetchSystemMetrics } from "./metrics";
import { getAgentPlugins } from "./plugins";
import { eq, sql } from "drizzle-orm";
import type { ServerConfig, OllamaRunningModel } from "./types";
import { checkServerAlerts } from "./alerts";
import { notifySubscribedUsers } from "./user-notifications";
import { readJsonEnv, readPositiveIntEnv } from "./env";

// --- In-memory state for diffing between polls --- loaded models between polls
const previousModels = new Map<number, Set<string>>();

// In-memory state for detecting server lifecycle transitions
const previousOnline = new Map<number, boolean>();
const previousBootSet = new Map<number, Set<string>>();

// Config lookup by host for per-server settings (e.g. metricsPort)
const serverConfigMap = new Map<string, ServerConfig>();

// --- Server configuration ---

function getServerConfigs(): ServerConfig[] {
  const parsed = readJsonEnv<ServerConfig[]>("OLLAMA_SERVERS");
  if (!parsed) {
    console.error("OLLAMA_SERVERS env var not set");
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error("OLLAMA_SERVERS env var must be a JSON array");
    return [];
  }

  return parsed;
}

async function ensureServersSeeded(configs: ServerConfig[]) {
  for (const config of configs) {
    const existing = await db
      .select()
      .from(servers)
      .where(eq(servers.host, config.host))
      .limit(1);

    if (existing.length === 0) {
      const backendType = config.backendType ?? "ollama";
      const maxConcurrent = config.maxConcurrent ?? (backendType === "vllm" ? 10 : 1);
      await db.insert(servers).values({
        name: config.name,
        host: config.host,
        totalRamGb: config.ramGb,
        backendType,
        maxConcurrent,
      });
      console.log(`Seeded server: ${config.name} (${config.host}) [${backendType}]`);
    }
  }
}

/** Resolve the metrics agent host:port for a server, or null to skip. */
function getMetricsHost(serverHost: string): string | null {
  const config = serverConfigMap.get(serverHost);

  // Explicitly disabled: metricsPort is 0 or null
  if (config?.metricsPort === 0 || config?.metricsPort === null) {
    return null;
  }

  const ip = serverHost.split(":")[0];

  // Use per-server override if set
  if (config?.metricsPort) {
    return `${ip}:${config.metricsPort}`;
  }

  // Fall back to fleet-metrics plugin defaultPort
  const metricsPlugin = getAgentPlugins().find((p) => p.configKey === "metricsPort");
  const defaultPort = metricsPlugin?.defaultPort ?? 9100;
  return `${ip}:${defaultPort}`;
}

// --- Main poll loop ---

async function pollAllServers() {
  const allServers = await db.select().from(servers);

  await Promise.all(
    allServers.map(async (server) => {
      try {
        // Resolve metrics host (null = skip metrics for this server)
        const metricsHost = getMetricsHost(server.host);

        // Dispatch to the right poller based on backend type
        const backendType = (server.backendType as string) ?? "ollama";
        const pollFn =
          backendType === "vllm" ? pollVllmServer :
          backendType === "generic" ? pollGenericServer :
          pollServer;

        // Fetch backend data and system metrics in parallel
        const [result, sysMetrics] = await Promise.all([
          pollFn(server.host),
          metricsHost ? fetchSystemMetrics(metricsHost) : Promise.resolve(null),
        ]);

        // Record snapshot
        const totalVramUsed = result.runningModels.reduce(
          (sum, m) => sum + (m.size_vram ?? 0),
          0
        );

        await db.insert(serverSnapshots).values({
          serverId: server.id,
          isOnline: result.isOnline,
          ollamaVersion: result.version,
          loadedModels: result.runningModels as unknown[],
          availableModels: result.availableModels as unknown[],
          totalVramUsed: totalVramUsed,
        });

        // Store system metrics if available
        if (sysMetrics) {
          await db.insert(systemMetrics).values({
            serverId: server.id,
            cpuTempC: sysMetrics.temperatures.cpu != null ? Math.round(sysMetrics.temperatures.cpu) : null,
            gpuTempC: sysMetrics.temperatures.gpu != null ? Math.round(sysMetrics.temperatures.gpu) : null,
            cpuPercent: sysMetrics.cpu_percent != null ? Math.round(sysMetrics.cpu_percent) : null,
            gpuPercent: sysMetrics.gpu_percent != null ? Math.round(sysMetrics.gpu_percent) : null,
            memTotalMb: sysMetrics.memory.total_mb,
            memUsedMb: sysMetrics.memory.used_mb,
            memAvailableMb: sysMetrics.memory.available_mb,
            swapTotalMb: sysMetrics.memory.swap_total_mb,
            swapUsedMb: sysMetrics.memory.swap_used_mb,
            loadAvg1: Math.round(sysMetrics.load_avg[0] * 100),
            loadAvg5: Math.round(sysMetrics.load_avg[1] * 100),
            loadAvg15: Math.round(sysMetrics.load_avg[2] * 100),
            uptimeSeconds: sysMetrics.uptime_seconds,
            diskTotalGb: sysMetrics.disk.total_gb,
            diskUsedGb: sysMetrics.disk.used_gb,
            recentBoots: sysMetrics.recent_boots,
          });
        }

        // Skip alerts and notifications for disabled (maintenance) servers
        const isDisabled = server.isDisabled ?? false;

        // Check for alert conditions (skip if in maintenance)
        if (!isDisabled) {
          await checkServerAlerts(server.name, result.isOnline, sysMetrics);
        }

        // --- Detect server lifecycle transitions ---
        const wasOnline = previousOnline.get(server.id);

        // Online/Offline transitions (skip first poll to avoid false positives)
        if (wasOnline !== undefined) {
          if (wasOnline && !result.isOnline) {
            await db.insert(serverEvents).values({
              serverId: server.id,
              eventType: "offline",
              detail: isDisabled ? "maintenance" : null,
            });
            console.log(`[${server.name}] Server went offline${isDisabled ? " (maintenance)" : ""}`);
            if (!isDisabled) {
              await notifySubscribedUsers({
                serverId: server.id,
                serverName: server.name,
                eventType: "offline",
                detail: null,
              });
            }
          } else if (!wasOnline && result.isOnline) {
            await db.insert(serverEvents).values({
              serverId: server.id,
              eventType: "online",
              detail: null,
            });
            console.log(`[${server.name}] Server came online`);
            if (!isDisabled) {
              await notifySubscribedUsers({
                serverId: server.id,
                serverName: server.name,
                eventType: "online",
                detail: null,
              });
            }
          }
        }
        previousOnline.set(server.id, result.isOnline);

        // Reboot detection via boot list diffing
        if (sysMetrics?.recent_boots && sysMetrics.recent_boots.length > 0) {
          const currentBoots = new Set(sysMetrics.recent_boots);
          const prevBoots = previousBootSet.get(server.id);

          if (prevBoots) {
            for (const boot of currentBoots) {
              if (!prevBoots.has(boot)) {
                // New boot detected, look up cause from metrics
                const cause = sysMetrics.reboot_causes?.[boot];
                let detail: string | null = null;
                if (cause) {
                  if (cause.cause === "user_command") {
                    detail = cause.user
                      ? `${cause.detail} (${cause.user})`
                      : cause.detail;
                  } else if (cause.cause === "power_button") {
                    detail = cause.detail;
                  }
                  // For "unknown", leave detail null
                }

                await db.insert(serverEvents).values({
                  serverId: server.id,
                  eventType: "reboot",
                  detail,
                  occurredAt: new Date(boot),
                });
                console.log(`[${server.name}] Reboot detected: ${detail ?? "unknown cause"}${isDisabled ? " (maintenance)" : ""}`);
                if (!isDisabled) {
                  await notifySubscribedUsers({
                    serverId: server.id,
                    serverName: server.name,
                    eventType: "reboot",
                    detail,
                  });
                }
                break; // One event per poll cycle is enough
              }
            }
          }

          previousBootSet.set(server.id, currentBoots);
        }

        // --- Detect model changes ---
        const currentModelNames = new Set(
          result.runningModels.map((m) => m.name)
        );
        const previousModelNames = previousModels.get(server.id) ?? new Set();

        // Build a lookup for model details
        const modelLookup = new Map<string, OllamaRunningModel>();
        for (const m of result.runningModels) {
          modelLookup.set(m.name, m);
        }

        // New models (loaded)
        for (const name of currentModelNames) {
          if (!previousModelNames.has(name)) {
            const model = modelLookup.get(name);
            await db.insert(modelEvents).values({
              serverId: server.id,
              modelName: name,
              eventType: "loaded",
              modelSize: model?.size ?? 0,
              vramSize: model?.size_vram ?? 0,
              parameterSize: model?.details?.parameter_size ?? null,
              quantization: model?.details?.quantization_level ?? null,
            });
            console.log(`[${server.name}] Model loaded: ${name}`);
          }
        }

        // Removed models (unloaded)
        for (const name of previousModelNames) {
          if (!currentModelNames.has(name)) {
            await db.insert(modelEvents).values({
              serverId: server.id,
              modelName: name,
              eventType: "unloaded",
              modelSize: 0,
              vramSize: 0,
            });
            console.log(`[${server.name}] Model unloaded: ${name}`);
          }
        }

        // Update in-memory state
        previousModels.set(server.id, currentModelNames);
      } catch (err) {
        console.error(`Error polling ${server.name}:`, err);
      }
    })
  );
}

// --- Data retention cleanup ---

async function cleanOldSnapshots() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await Promise.all([
    db.delete(serverSnapshots).where(sql`${serverSnapshots.polledAt} < ${sevenDaysAgo}`),
    db.delete(systemMetrics).where(sql`${systemMetrics.polledAt} < ${sevenDaysAgo}`),
    db.delete(serverEvents).where(sql`${serverEvents.occurredAt} < ${sevenDaysAgo}`),
  ]);
}

let pollInterval: ReturnType<typeof setInterval> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// --- Poller lifecycle ---

export async function startPoller() {
  const configs = getServerConfigs();
  if (configs.length === 0) {
    console.error("No servers configured, poller not starting");
    return;
  }

  // Build config lookup for per-server settings (e.g. metricsPort)
  for (const config of configs) {
    serverConfigMap.set(config.host, config);
  }

  console.log(`Starting poller for ${configs.length} servers...`);
  await ensureServersSeeded(configs);

  // Initial poll
  await pollAllServers();

  // Poll on interval
  let intervalSec = 10;
  try {
    intervalSec = readPositiveIntEnv("POLL_INTERVAL", 10);
  } catch (err) {
    console.error(err instanceof Error ? err.message : "Invalid POLL_INTERVAL");
  }
  pollInterval = setInterval(pollAllServers, intervalSec * 1000);
  console.log(`Polling every ${intervalSec}s`);

  // Clean old snapshots once per hour
  cleanupInterval = setInterval(cleanOldSnapshots, 60 * 60 * 1000);
}

export { pollAllServers };
