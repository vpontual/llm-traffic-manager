/**
 * Tracks in-flight generation requests per server.
 * A server is considered "busy" when it has at least one active request.
 */
export class BusyRequestTracker {
  private readonly inFlight = new Map<number, number>();

  markStart(serverId: number): void {
    this.inFlight.set(serverId, (this.inFlight.get(serverId) ?? 0) + 1);
  }

  markEnd(serverId: number): void {
    const count = this.inFlight.get(serverId) ?? 0;
    if (count <= 1) {
      this.inFlight.delete(serverId);
    } else {
      this.inFlight.set(serverId, count - 1);
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
