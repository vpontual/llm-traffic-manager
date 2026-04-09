/**
 * Rolling-window health tracker per server.
 *
 * Tracks recent request outcomes (success/error) in a sliding window.
 * Servers with error rates above the threshold are considered "degraded"
 * and deprioritized in routing decisions.
 */

const WINDOW_MS = 300000; // 5-minute rolling window
const DEGRADE_THRESHOLD = 0.5; // 50% error rate = degraded
const MIN_SAMPLES = 3; // Need at least 3 requests before judging

interface RequestOutcome {
  timestamp: number;
  success: boolean;
}

const outcomes = new Map<number, RequestOutcome[]>();

function pruneOld(serverId: number): RequestOutcome[] {
  const cutoff = Date.now() - WINDOW_MS;
  const entries = outcomes.get(serverId) ?? [];
  const fresh = entries.filter((e) => e.timestamp > cutoff);
  if (fresh.length === 0) {
    outcomes.delete(serverId);
  } else {
    outcomes.set(serverId, fresh);
  }
  return fresh;
}

export function recordSuccess(serverId: number): void {
  const entries = outcomes.get(serverId) ?? [];
  entries.push({ timestamp: Date.now(), success: true });
  outcomes.set(serverId, entries);
}

export function recordError(serverId: number): void {
  const entries = outcomes.get(serverId) ?? [];
  entries.push({ timestamp: Date.now(), success: false });
  outcomes.set(serverId, entries);
}

export function getErrorRate(serverId: number): number {
  const fresh = pruneOld(serverId);
  if (fresh.length < MIN_SAMPLES) return 0;
  const errors = fresh.filter((e) => !e.success).length;
  return errors / fresh.length;
}

/**
 * Returns server IDs with error rates above the degradation threshold.
 * Only flags servers with enough samples to be statistically meaningful.
 */
export function getDegradedServerIds(): number[] {
  const degraded: number[] = [];
  for (const serverId of outcomes.keys()) {
    if (getErrorRate(serverId) >= DEGRADE_THRESHOLD) {
      degraded.push(serverId);
    }
  }
  return degraded;
}

/**
 * Get a summary of all tracked servers' health for logging/debugging.
 */
export function getHealthSummary(): Record<number, { total: number; errors: number; rate: number }> {
  const summary: Record<number, { total: number; errors: number; rate: number }> = {};
  for (const serverId of outcomes.keys()) {
    const fresh = pruneOld(serverId);
    const errors = fresh.filter((e) => !e.success).length;
    summary[serverId] = {
      total: fresh.length,
      errors,
      rate: fresh.length >= MIN_SAMPLES ? errors / fresh.length : 0,
    };
  }
  return summary;
}
