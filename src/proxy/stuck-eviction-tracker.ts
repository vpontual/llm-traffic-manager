/**
 * Tracks consecutive eviction failures per (server, model) pair.
 *
 * When the proxy needs to free VRAM by unloading an idle model, the
 * unload request can fail (e.g., Ollama stuck slot, network blip). One
 * failure is fine. Many in a row is a real problem and needs a human.
 *
 * After `failureThreshold` consecutive failures for the same key, the
 * tracker recommends an alert -- but only once per `alertCooldownMs` so
 * the human is not paged repeatedly while diagnosing.
 *
 * State resets when:
 *   - an unload succeeds (recordSuccess)
 *   - the model is no longer reported as loaded (resetIfNotLoaded)
 */
export class StuckEvictionTracker {
  private readonly failures = new Map<string, number>();
  private readonly lastAlertedAt = new Map<string, number>();

  constructor(
    private readonly failureThreshold: number,
    private readonly alertCooldownMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  private static key(serverId: number, modelName: string): string {
    return `${serverId}:${modelName}`;
  }

  /** Returns the consecutive-failure count and whether to alert now. */
  recordFailure(serverId: number, modelName: string): { count: number; shouldAlert: boolean } {
    const k = StuckEvictionTracker.key(serverId, modelName);
    const count = (this.failures.get(k) ?? 0) + 1;
    this.failures.set(k, count);

    if (count < this.failureThreshold) return { count, shouldAlert: false };

    const last = this.lastAlertedAt.get(k);
    if (last !== undefined && this.now() - last <= this.alertCooldownMs) {
      return { count, shouldAlert: false };
    }

    this.lastAlertedAt.set(k, this.now());
    return { count, shouldAlert: true };
  }

  recordSuccess(serverId: number, modelName: string): void {
    const k = StuckEvictionTracker.key(serverId, modelName);
    this.failures.delete(k);
    this.lastAlertedAt.delete(k);
  }

  /** Reset state for any model on this server that is no longer loaded. */
  resetIfNotLoaded(serverId: number, loadedModelNames: Set<string>): void {
    for (const k of Array.from(this.failures.keys())) {
      const sep = k.indexOf(":");
      if (sep < 0) continue;
      const sid = Number(k.slice(0, sep));
      const name = k.slice(sep + 1);
      if (sid === serverId && !loadedModelNames.has(name)) {
        this.failures.delete(k);
        this.lastAlertedAt.delete(k);
      }
    }
  }

  /** Test/debug accessor. */
  failureCount(serverId: number, modelName: string): number {
    return this.failures.get(StuckEvictionTracker.key(serverId, modelName)) ?? 0;
  }
}
