import { db } from "./db";
import { servers, serverSnapshots, modelEvents, systemMetrics } from "./schema";
import { pollServer } from "./ollama";
import { fetchSystemMetrics } from "./metrics";
import { eq } from "drizzle-orm";
import type { ServerConfig, OllamaRunningModel } from "./types";
import { checkServerAlerts } from "./alerts";

// In-memory state for diffing loaded models between polls
const previousModels = new Map<number, Set<string>>();

function getServerConfigs(): ServerConfig[] {
  const raw = process.env.OLLAMA_SERVERS;
  if (!raw) {
    console.error("OLLAMA_SERVERS env var not set");
    return [];
  }
  try {
    return JSON.parse(raw);
  } catch {
    console.error("Failed to parse OLLAMA_SERVERS:", raw);
    return [];
  }
}

async function ensureServersSeeded(configs: ServerConfig[]) {
  for (const config of configs) {
    const existing = await db
      .select()
      .from(servers)
      .where(eq(servers.host, config.host))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(servers).values({
        name: config.name,
        host: config.host,
        totalRamGb: config.ramGb,
      });
      console.log(`Seeded server: ${config.name} (${config.host})`);
    }
  }
}

async function pollAllServers() {
  const allServers = await db.select().from(servers);

  await Promise.all(
    allServers.map(async (server) => {
      try {
        // Fetch Ollama data and system metrics in parallel
        const metricsHost = server.host.split(":")[0] + ":9100";
        const [result, sysMetrics] = await Promise.all([
          pollServer(server.host),
          fetchSystemMetrics(metricsHost),
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
            cpuPercent: sysMetrics.cpu_percent != null ? Math.round(sysMetrics.cpu_percent) : null,
            gpuPercent: sysMetrics.gpu_percent != null ? Math.round(sysMetrics.gpu_percent) : null,
            recentBoots: sysMetrics.recent_boots,
          });
        }

        // Check for alert conditions
        await checkServerAlerts(server.name, result.isOnline, sysMetrics);

        // Detect model changes
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

async function cleanOldSnapshots() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { sql } = await import("drizzle-orm");
  await Promise.all([
    db.delete(serverSnapshots).where(sql`${serverSnapshots.polledAt} < ${sevenDaysAgo}`),
    db.delete(systemMetrics).where(sql`${systemMetrics.polledAt} < ${sevenDaysAgo}`),
  ]);
}

let pollInterval: ReturnType<typeof setInterval> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export async function startPoller() {
  const configs = getServerConfigs();
  if (configs.length === 0) {
    console.error("No servers configured, poller not starting");
    return;
  }

  console.log(`Starting poller for ${configs.length} servers...`);
  await ensureServersSeeded(configs);

  // Initial poll
  await pollAllServers();

  // Poll on interval
  const intervalSec = parseInt(process.env.POLL_INTERVAL ?? "10", 10);
  pollInterval = setInterval(pollAllServers, intervalSec * 1000);
  console.log(`Polling every ${intervalSec}s`);

  // Clean old snapshots once per hour
  cleanupInterval = setInterval(cleanOldSnapshots, 60 * 60 * 1000);
}

export { pollAllServers };
