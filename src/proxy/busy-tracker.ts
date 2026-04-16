/**
 * Tracks in-flight generation requests per server.
 *
 * Each markStart returns a SlotHandle that markEnd uses to release the
 * exact slot. This is safer than keying on serverId alone: if two requests
 * on the same server complete out of order, each markEnd clears its own
 * safety timer instead of whichever was oldest.
 *
 * A server is "busy" when it has at least one active request. Slots
 * auto-release after MAX_SLOT_HOLD_MS to prevent permanent leaks — this
 * should never happen in practice; if it does, inspect markEnd call paths.
 */
const MAX_SLOT_HOLD_MS = 300000; // 5 minutes — no generation should take longer

export interface SlotHandle {
  readonly serverId: number;
  readonly slotId: number;
}

export class BusyRequestTracker {
  private readonly inFlight = new Map<number, number>();
  private readonly slotTimers = new Map<number, Map<number, ReturnType<typeof setTimeout>>>();
  private readonly waiters = new Map<number, Array<() => void>>();
  private nextSlotId = 1;
  private autoReleasedCount = 0;

  markStart(serverId: number): SlotHandle {
    const slotId = this.nextSlotId++;
    this.inFlight.set(serverId, (this.inFlight.get(serverId) ?? 0) + 1);

    const timer = setTimeout(() => {
      console.warn(
        `[busy-tracker] Auto-releasing stuck slot ${slotId} on server ${serverId} after ${MAX_SLOT_HOLD_MS / 1000}s`
      );
      this.autoReleasedCount++;
      this.releaseSlot(serverId, slotId, /*timerAlreadyFired=*/true);
    }, MAX_SLOT_HOLD_MS);
    if (typeof timer.unref === "function") timer.unref();

    let timers = this.slotTimers.get(serverId);
    if (!timers) {
      timers = new Map();
      this.slotTimers.set(serverId, timers);
    }
    timers.set(slotId, timer);
    return { serverId, slotId };
  }

  markEnd(handle: SlotHandle): void {
    this.releaseSlot(handle.serverId, handle.slotId, false);
  }

  private releaseSlot(serverId: number, slotId: number, timerAlreadyFired: boolean): void {
    const timers = this.slotTimers.get(serverId);
    if (!timers || !timers.has(slotId)) {
      // Already released (e.g., safety timer fired then caller also called markEnd).
      return;
    }
    const timer = timers.get(slotId)!;
    if (!timerAlreadyFired) clearTimeout(timer);
    timers.delete(slotId);
    if (timers.size === 0) this.slotTimers.delete(serverId);

    const count = this.inFlight.get(serverId) ?? 0;
    if (count <= 1) {
      this.inFlight.delete(serverId);
    } else {
      this.inFlight.set(serverId, count - 1);
    }

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

  /** Returns server IDs where in-flight requests >= the server's limit (default 1). */
  getFullServerIds(limits: Map<number, number>): number[] {
    const full: number[] = [];
    for (const [serverId, count] of this.inFlight) {
      const limit = limits.get(serverId) ?? 1;
      if (count >= limit) full.push(serverId);
    }
    return full;
  }

  getInFlightCount(serverId: number): number {
    return this.inFlight.get(serverId) ?? 0;
  }

  isAtCapacity(serverId: number, limit: number): boolean {
    return (this.inFlight.get(serverId) ?? 0) >= limit;
  }

  /**
   * FIFO queue: wait until a slot opens on serverId. Resolves immediately
   * if under capacity. Rejects after timeoutMs if still blocked.
   */
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

  /** Monotonic count of slots auto-released by the safety timer. Should stay 0. */
  getAutoReleasedCount(): number {
    return this.autoReleasedCount;
  }
}
