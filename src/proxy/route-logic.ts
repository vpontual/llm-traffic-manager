// Pure routing selection logic -- picks the best server based on model availability and VRAM.
// Extracted from router.ts to enable unit testing without database dependencies.

import type { OllamaRunningModel, OllamaAvailableModel } from "../lib/types";

export interface ServerSnapshot {
  id: number;
  name: string;
  host: string;
  totalRamGb: number;
  isOnline: boolean;
  loadedModels: OllamaRunningModel[];
  availableModels: OllamaAvailableModel[];
  totalVramUsed: number;
}

/** Calculate free VRAM in bytes */
export function freeVram(s: ServerSnapshot): number {
  return s.totalRamGb * 1024 * 1024 * 1024 - s.totalVramUsed;
}

/** Pick server by priority: highest RAM tier first, round-robin among ties */
export function pickByPriority(
  candidates: ServerSnapshot[],
  roundRobinCounter: number
): { server: ServerSnapshot; nextCounter: number } {
  const sorted = [...candidates].sort((a, b) => b.totalRamGb - a.totalRamGb);
  const topRam = sorted[0].totalRamGb;
  const tied = sorted.filter((s) => s.totalRamGb === topRam);
  const server = tied[roundRobinCounter % tied.length];
  return { server, nextCounter: roundRobinCounter + 1 };
}

export interface SelectRouteParams {
  onlineServers: ServerSnapshot[];
  modelName: string;
  optimisticServerId: number | null;
  lastRoutedServerId: number | null;
  roundRobinCounter: number;
}

export interface SelectRouteResult {
  server: ServerSnapshot;
  reason: string;
  roundRobinCounter: number;
}

/**
 * Pure routing decision: given server states and context, pick the best server.
 *
 * Priority:
 * 1. Server with model loaded in memory (poller data or optimistic tracking)
 * 2. Server with model downloaded (available), preferring anti-churn rotation
 * 3. Fallback: server with most free VRAM
 */
export function selectRoute(params: SelectRouteParams): SelectRouteResult | null {
  const { onlineServers, modelName, optimisticServerId, lastRoutedServerId } = params;
  let counter = params.roundRobinCounter;

  if (onlineServers.length === 0) return null;

  // 1. Server with model loaded in memory (poller data OR optimistic)
  const withModelLoaded = onlineServers.filter(
    (s) =>
      s.loadedModels.some((m) => m.name === modelName) ||
      s.id === optimisticServerId
  );

  if (withModelLoaded.length > 0) {
    const { server, nextCounter } = pickByPriority(withModelLoaded, counter);
    return { server, reason: "model_loaded", roundRobinCounter: nextCounter };
  }

  // 2. Server with model downloaded (available)
  const withModelAvailable = onlineServers.filter((s) =>
    s.availableModels.some((m) => m.name === modelName)
  );

  if (withModelAvailable.length > 0) {
    let candidates = withModelAvailable;
    let reason = "model_available";

    // Anti-churn: if multiple servers have the model, avoid the one that last
    // handled it (it unloaded -> VRAM pressure -> try a different server)
    if (lastRoutedServerId != null && candidates.length > 1) {
      const others = candidates.filter((s) => s.id !== lastRoutedServerId);
      if (others.length > 0) {
        candidates = others;
        reason = "model_available_anti_churn";
      }
    }

    const { server, nextCounter } = pickByPriority(candidates, counter);
    return { server, reason, roundRobinCounter: nextCounter };
  }

  // 3. Fall back to server with most free VRAM
  const { server, nextCounter } = pickByPriority(onlineServers, counter);
  return { server, reason: "fallback_most_vram", roundRobinCounter: nextCounter };
}
