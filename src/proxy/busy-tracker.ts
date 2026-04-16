/**
 * Tracks in-flight generation requests per server.
 * A server is considered "busy" when it has at least one active request.
 * Safety: slots auto-release after MAX_SLOT_HOLD_MS to prevent permanent leaks.
 */
const MAX_SLOT_HOLD_MS = 300000; // 5 minutes — no generation should take longer

export class BusyRequestTracker {
  private readonly inFlight = new Map<number, number>();
  private readonly slotTimers = new Map<number, ReturnType<typeof setTimeout>[]>();

  markStart(serverId: number): void {
    this.inFlight.set(serverId, (this.inFlight.get(serverId) ?? 0) + 1);

    // Safety timer: auto-release this slot if markEnd is never called
    const timer = setTimeout(() => {
      console.warn(`[busy-tracker] Auto-releasing stuck slot on server ${serverId} after ${MAX_SLOT_HOLD_MS / 1000}s`);
      this.markEnd(serverId);
      // Remove this timer from the list
      const timers = this.slotTimers.get(serverId);
      if (timers) {
        const idx = timers.indexOf(timer);
        if (idx !== -1) timers.splice(idx, 1);
        if (timers.length === 0) this.slotTimers.delete(serverId);
      }
    }, MAX_SLOT_HOLD_MS);
    // Unref so this safety timer never blocks process exit (e.g. in tests).
    if (typeof timer.unref === "function") timer.unref();

    if (!this.slotTimers.has(serverId)) {
      this.slotTimers.set(serverId, []);
    }
    this.slotTimers.get(serverId)!.push(timer);
  }

  markEnd(serverId: number): void {
    const count = this.inFlight.get(serverId) ?? 0;
    if (count <= 1) {
      this.inFlight.delete(serverId);
    } else {
      this.inFlight.set(serverId, count - 1);
    }

    // Clear the oldest safety timer for this server
    const timers = this.slotTimers.get(serverId);
    if (timers && timers.length > 0) {
      clearTimeout(timers.shift()!);
      if (timers.length === 0) this.slotTimers.delete(serverId);
    }

    // Notify the next waiter in the queue for this server
    const queue = this.waiters.get(serverId);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) this.waiters.delete(serverId);
      next();
    }
  }

  getBusyServerIds(): number[] {
    return [...this.inFlight.keys()];
  }

  /**
   * Returns server IDs where in-flight requests >= the server's limit.
   * Servers not in the limits map default to limit=1 (Ollama behavior).
   */
  getFullServerIds(limits: Map<number, number>): number[] {
    const full: number[] = [];
    for (const [serverId, count] of this.inFlight) {
      const limit = limits.get(serverId) ?? 1;
      if (count >= limit) {
        full.push(serverId);
      }
    }
    return full;
  }

  getInFlightCount(serverId: number): number {
    return this.inFlight.get(serverId) ?? 0;
  }

  /**
   * Check if a server is at capacity given its concurrency limit.
   */
  isAtCapacity(serverId: number, limit: number): boolean {
    return (this.inFlight.get(serverId) ?? 0) >= limit;
  }

  /**
   * Wait in a FIFO queue until a slot opens on the given server.
   * Returns immediately if the server is not at capacity.
   * Rejects after timeoutMs if no slot opens.
   */
  private readonly waiters = new Map<number, Array<() => void>>();

  waitForSlot(serverId: number, limit: number, timeoutMs: number = 300000): Promise<void> {
    if (!this.isAtCapacity(serverId, limit)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const queue = this.waiters.get(serverId);
        if (queue) {
          const idx = queue.indexOf(doResolve);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) this.waiters.delete(serverId);
        }
        reject(new Error(`Queue timeout: server ${serverId} busy for ${timeoutMs}ms`));
      }, timeoutMs);

      const doResolve = () => {
        clearTimeout(timer);
        resolve();
      };

      if (!this.waiters.has(serverId)) {
        this.waiters.set(serverId, []);
      }
      this.waiters.get(serverId)!.push(doResolve);
    });
  }

  getQueueLength(serverId: number): number {
    return this.waiters.get(serverId)?.length ?? 0;
  }

}
