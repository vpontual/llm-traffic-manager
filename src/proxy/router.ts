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

// In-memory cache of server states, refreshed periodically
let cachedStates: ServerSnapshot[] = [];
let lastRefresh = 0;
const CACHE_TTL_MS = 3000; // 3 seconds

// Round-robin counter for tiebreaking when multiple servers have equal free VRAM
let roundRobinCounter = 0;

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

  cachedStates = states;
  lastRefresh = now;
  return states;
}

function freeVram(s: ServerSnapshot): number {
  return s.totalRamGb * 1024 * 1024 * 1024 - s.totalVramUsed;
}

/** Sort by most free VRAM, then round-robin among ties */
function pickBest(candidates: ServerSnapshot[]): ServerSnapshot {
  candidates.sort((a, b) => freeVram(b) - freeVram(a));
  // Find all candidates tied with the top free VRAM
  const topFree = freeVram(candidates[0]);
  const tied = candidates.filter((s) => freeVram(s) === topFree);
  const pick = tied[roundRobinCounter % tied.length];
  roundRobinCounter++;
  return pick;
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
 * 1. Server that already has the model loaded in memory
 * 2. Server that has the model downloaded + most free VRAM
 * 3. Server with the most free VRAM (will need to pull)
 */
export async function routeModel(modelName: string): Promise<RouteDecision | null> {
  const states = await refreshServerStates();
  const onlineServers = states.filter((s) => s.isOnline);

  if (onlineServers.length === 0) return null;

  // 1. Server with model already loaded in memory
  const withModelLoaded = onlineServers.filter((s) =>
    s.loadedModels.some((m) => m.name === modelName)
  );

  if (withModelLoaded.length > 0) {
    const best = pickBest(withModelLoaded);
    return {
      host: best.host,
      serverId: best.id,
      serverName: best.name,
      reason: "model_loaded",
    };
  }

  // 2. Server with model downloaded (available) + most free VRAM
  const withModelAvailable = onlineServers.filter((s) =>
    s.availableModels.some((m) => m.name === modelName)
  );

  if (withModelAvailable.length > 0) {
    const best = pickBest(withModelAvailable);
    return {
      host: best.host,
      serverId: best.id,
      serverName: best.name,
      reason: "model_available",
    };
  }

  // 3. Fall back to server with most free VRAM
  const best = pickBest(onlineServers);
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
