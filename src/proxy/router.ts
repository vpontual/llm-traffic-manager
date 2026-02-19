// Smart model router -- picks the best server for each request.
//
// Priority: model loaded in memory > model on disk (anti-churn) > most free VRAM.
// Within each tier: highest-RAM server first, round-robin among ties.
// Optimistic tracking bridges the gap between routing and poller confirmation.

import { db } from "../lib/db";
import { servers, serverSnapshots } from "../lib/schema";
import { eq, desc } from "drizzle-orm";
import type { OllamaRunningModel, OllamaAvailableModel } from "../lib/types";
import { selectRoute, freeVram, type ServerSnapshot } from "./route-logic";
import { BusyRequestTracker } from "./busy-tracker";


// In-memory cache of server states, refreshed periodically from poller DB data
let cachedStates: ServerSnapshot[] = [];
let lastRefresh = 0;
const CACHE_TTL_MS = 3000; // 3 seconds

// Round-robin counter for tiebreaking among equal-priority servers (e.g. Nanos)
let roundRobinCounter = 0;

// Track which server last handled each model (for anti-churn routing)
const lastRoutedServer = new Map<string, number>();

// Optimistic load tracking: after routing a model to a server, treat it as
// "loaded" there until the poller confirms otherwise. This bridges the gap
// between routing a request and the poller detecting the model is loaded
// (~10s polling interval), preventing anti-churn from incorrectly kicking in
// on back-to-back requests for the same model.
const optimisticLoads = new Map<string, { serverId: number; timestamp: number }>();
const OPTIMISTIC_TTL_MS = 30000; // 30s, enough for load + poller to catch up

const busyTracker = new BusyRequestTracker();

export function markRequestStart(serverId: number): void {
  busyTracker.markStart(serverId);
}

export function markRequestEnd(serverId: number): void {
  busyTracker.markEnd(serverId);
}

function getBusyServerIds(): number[] {
  // Build per-server concurrency limits from cached state
  const limits = new Map<number, number>();
  for (const s of cachedStates) {
    limits.set(s.id, s.maxConcurrent);
  }
  return busyTracker.getFullServerIds(limits);
}

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
      backendType: (server.backendType as "ollama" | "vllm" | "generic") ?? "ollama",
      maxConcurrent: server.maxConcurrent ?? 1,
      isDisabled: server.isDisabled ?? false,
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
 *      so it has VRAM pressure, so try a different server to reduce churn)
 *    - If only one server has it, route there regardless
 * 3. Fallback: server with the most free VRAM (will need to pull the model)
 *
 * @param excludeServerIds - Server IDs to skip (used by retry logic when a
 *   server returned model-not-found or was unreachable)
 */
export async function routeModel(
  modelName: string,
  excludeServerIds: number[] = [],
  endpointPath?: string | null
): Promise<RouteDecision | null> {
  const states = await refreshServerStates();
  const onlineServers = states.filter(
    (s) => s.isOnline && !s.isDisabled && !excludeServerIds.includes(s.id)
  );

  if (onlineServers.length === 0) return null;

  const optimistic = optimisticLoads.get(modelName);
  const optimisticServerId =
    optimistic && Date.now() - optimistic.timestamp <= OPTIMISTIC_TTL_MS
      ? optimistic.serverId
      : null;

  const result = selectRoute({
    onlineServers,
    modelName,
    optimisticServerId,
    lastRoutedServerId: lastRoutedServer.get(modelName) ?? null,
    roundRobinCounter,
    busyServerIds: getBusyServerIds(),
    endpointPath,
  });

  if (!result) return null;

  roundRobinCounter = result.roundRobinCounter;
  lastRoutedServer.set(modelName, result.server.id);
  optimisticLoads.set(modelName, {
    serverId: result.server.id,
    timestamp: Date.now(),
  });

  return {
    host: result.server.host,
    serverId: result.server.id,
    serverName: result.server.name,
    reason: result.reason,
  };
}

/**
 * Clear optimistic load and last-routed tracking for a model on a specific
 * server. Called by the proxy retry logic when a server returns model-not-found
 * or is unreachable, so the next routing attempt isn't biased toward it.
 */
export function clearOptimisticLoad(modelName: string, serverId: number): void {
  const entry = optimisticLoads.get(modelName);
  if (entry && entry.serverId === serverId) {
    optimisticLoads.delete(modelName);
  }
  if (lastRoutedServer.get(modelName) === serverId) {
    lastRoutedServer.delete(modelName);
  }
}

/**
 * Recommend the best server to pull a model to, based on free VRAM.
 * Returns server details with reasoning, or null if no servers are online.
 * Uses cached state (synchronous) so it can be called from error handlers.
 */
export interface PullRecommendation {
  serverName: string;
  serverHost: string;
  totalRamGb: number;
  freeVramGb: number;
  loadedModels: string[];
  reason: string;
}

export function getRecommendedPullServer(): PullRecommendation | null {
  const online = cachedStates.filter((s) => s.isOnline);
  if (online.length === 0) return null;

  const sorted = [...online].sort((a, b) => freeVram(b) - freeVram(a));
  const best = sorted[0];
  const freeGb = Math.round((freeVram(best) / (1024 * 1024 * 1024)) * 10) / 10;

  return {
    serverName: best.name,
    serverHost: best.host,
    totalRamGb: best.totalRamGb,
    freeVramGb: freeGb,
    loadedModels: best.loadedModels.map((m) => m.name),
    reason: `Most free VRAM (${freeGb} GB of ${best.totalRamGb} GB)`,
  };
}

/**
 * Pick any online server (for model-less endpoints like /api/tags)
 */
export async function pickAnyServer(): Promise<RouteDecision | null> {
  const states = await refreshServerStates();
  const online = states.filter((s) => s.isOnline && !s.isDisabled);
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
  return states.filter((s) => s.isOnline && !s.isDisabled);
}

/**
 * Resolve a server by name (case-insensitive). Returns a RouteDecision if the
 * server is online, null otherwise. Used by the proxy to honor
 * X-Ollama-Pin-Server headers from services that know which server they want.
 */
export async function resolveServerByName(
  serverName: string
): Promise<RouteDecision | null> {
  const states = await refreshServerStates();
  const lower = serverName.toLowerCase();
  const server = states.find(
    (s) => s.isOnline && !s.isDisabled && s.name.toLowerCase() === lower
  );
  if (!server) return null;
  return {
    host: server.host,
    serverId: server.id,
    serverName: server.name,
    reason: "pinned_by_header",
  };
}
