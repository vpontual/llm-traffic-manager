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
      return;
    }
    this.inFlight.set(serverId, count - 1);
  }

  getBusyServerIds(): number[] {
    return [...this.inFlight.keys()];
  }

  getInFlightCount(serverId: number): number {
    return this.inFlight.get(serverId) ?? 0;
  }
}
