import { db } from "../lib/db";
import { servers, serverSnapshots } from "../lib/schema";
import { eq, desc } from "drizzle-orm";
import type { OllamaRunningModel, OllamaAvailableModel } from "../lib/types";

interface ServerSnapshot {
  id: number;
  name: string;
  host: string;
  totalRamGb: number;
  isOnline: boolean;
  loadedModels: OllamaRunningModel[];
  availableModels: OllamaAvailableModel[];
  totalVramUsed: number;
}

// In-memory cache of server states, refreshed periodically from poller DB data
let cachedStates: ServerSnapshot[] = [];
let lastRefresh = 0;
const CACHE_TTL_MS = 3000; // 3 seconds

// Track which server last handled each model (for anti-churn routing)
const lastRoutedServer = new Map<string, number>();

// Optimistic load tracking: after routing a model to a server, treat it as
// "loaded" there until the poller confirms otherwise. This bridges the gap
// between routing a request and the poller detecting the model is loaded
// (~10s polling interval), preventing anti-churn from incorrectly kicking in
// on back-to-back requests for the same model.
const optimisticLoads = new Map<string, { serverId: number; timestamp: number }>();
const OPTIMISTIC_TTL_MS = 30000; // 30s — enough for load + poller to catch up

export async function refreshServerStates(): Promise<ServerSnapshot[]> {
  const now = Date.now();
  if (now - lastRefresh < CACHE_TTL_MS && cachedStates.length > 0) {
    return cachedStates;
  }

  const allServers = await db.select().from(servers);
  const states: ServerSnapshot[] = [];

  for (const server of allServers) {
    const [latest] = await db
      .select()
      .from(serverSnapshots)
      .where(eq(serverSnapshots.serverId, server.id))
      .orderBy(desc(serverSnapshots.polledAt))
      .limit(1);

    states.push({
      id: server.id,
      name: server.name,
      host: server.host,
      totalRamGb: server.totalRamGb,
      isOnline: latest?.isOnline ?? false,
      loadedModels: (latest?.loadedModels ?? []) as OllamaRunningModel[],
      availableModels: (latest?.availableModels ?? []) as OllamaAvailableModel[],
      totalVramUsed: latest?.totalVramUsed ?? 0,
    });
  }

  // Clear optimistic entries for models that the poller now confirms are loaded.
  // This keeps the optimistic map small and lets poller data take over.
  for (const [modelName, entry] of optimisticLoads) {
    const server = states.find((s) => s.id === entry.serverId);
    if (server && server.loadedModels.some((m) => m.name === modelName)) {
      optimisticLoads.delete(modelName);
    }
    // Also expire stale entries
    if (now - entry.timestamp > OPTIMISTIC_TTL_MS) {
      optimisticLoads.delete(modelName);
    }
  }

  cachedStates = states;
  lastRefresh = now;
  return states;
}

function freeVram(s: ServerSnapshot): number {
  return s.totalRamGb * 1024 * 1024 * 1024 - s.totalVramUsed;
}

/** Pick server with most free VRAM */
function pickByVram(candidates: ServerSnapshot[]): ServerSnapshot {
  candidates.sort((a, b) => freeVram(b) - freeVram(a));
  return candidates[0];
}

export interface RouteDecision {
  host: string;
  serverId: number;
  serverName: string;
  reason: string;
}

/**
 * Pick the best server for a model request.
 *
 * Priority:
 * 1. Server that has the model loaded in memory (from poller data or optimistic
 *    tracking after a recent routing decision)
 * 2. Server that has the model downloaded (available):
 *    - If multiple servers have it, avoid the one that last ran it (it unloaded,
 *      so it has VRAM pressure — try a different server to reduce churn)
 *    - If only one server has it, route there regardless
 * 3. Fallback: server with the most free VRAM (will need to pull the model)
 */
export async function routeModel(modelName: string): Promise<RouteDecision | null> {
  const states = await refreshServerStates();
  const onlineServers = states.filter((s) => s.isOnline);

  if (onlineServers.length === 0) return null;

  // Check optimistic loads for this model
  const optimistic = optimisticLoads.get(modelName);
  const optimisticServerId =
    optimistic && Date.now() - optimistic.timestamp <= OPTIMISTIC_TTL_MS
      ? optimistic.serverId
      : null;

  // 1. Server with model loaded in memory (poller data OR optimistic)
  const withModelLoaded = onlineServers.filter(
    (s) =>
      s.loadedModels.some((m) => m.name === modelName) ||
      s.id === optimisticServerId
  );

  if (withModelLoaded.length > 0) {
    const best = pickByVram(withModelLoaded);
    lastRoutedServer.set(modelName, best.id);
    // Refresh optimistic timestamp — stays valid while model is actively used
    optimisticLoads.set(modelName, { serverId: best.id, timestamp: Date.now() });
    return {
      host: best.host,
      serverId: best.id,
      serverName: best.name,
      reason: "model_loaded",
    };
  }

  // 2. Server with model downloaded (available)
  const withModelAvailable = onlineServers.filter((s) =>
    s.availableModels.some((m) => m.name === modelName)
  );

  if (withModelAvailable.length > 0) {
    let candidates = withModelAvailable;

    // If multiple servers have the model, avoid the one that last handled it.
    // That server unloaded the model (VRAM pressure), so try a different one
    // to spread the load and reduce churn.
    const lastServerId = lastRoutedServer.get(modelName);
    if (lastServerId != null && candidates.length > 1) {
      const others = candidates.filter((s) => s.id !== lastServerId);
      if (others.length > 0) {
        candidates = others;
      }
    }

    const best = pickByVram(candidates);
    lastRoutedServer.set(modelName, best.id);
    // Mark as optimistically loaded so the next request routes here too
    optimisticLoads.set(modelName, { serverId: best.id, timestamp: Date.now() });
    return {
      host: best.host,
      serverId: best.id,
      serverName: best.name,
      reason: candidates.length < withModelAvailable.length
        ? "model_available_anti_churn"
        : "model_available",
    };
  }

  // 3. Fall back to server with most free VRAM
  const best = pickByVram(onlineServers);
  lastRoutedServer.set(modelName, best.id);
  optimisticLoads.set(modelName, { serverId: best.id, timestamp: Date.now() });
  return {
    host: best.host,
    serverId: best.id,
    serverName: best.name,
    reason: "fallback_most_vram",
  };
}

/**
 * Pick any online server (for model-less endpoints like /api/tags)
 */
export async function pickAnyServer(): Promise<RouteDecision | null> {
  const states = await refreshServerStates();
  const online = states.filter((s) => s.isOnline);
  if (online.length === 0) return null;
  return {
    host: online[0].host,
    serverId: online[0].id,
    serverName: online[0].name,
    reason: "any_online",
  };
}

/**
 * Get all online servers (for aggregation endpoints)
 */
export async function getAllOnlineServers(): Promise<ServerSnapshot[]> {
  const states = await refreshServerStates();
  return states.filter((s) => s.isOnline);
}
