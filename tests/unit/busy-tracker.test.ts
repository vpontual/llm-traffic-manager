import assert from "node:assert/strict";
import test from "node:test";
import { BusyRequestTracker } from "../../src/proxy/busy-tracker";
import { selectRoute, type ServerSnapshot } from "../../src/proxy/route-logic";

function makeServer(overrides: Partial<ServerSnapshot> & { id: number; name: string }): ServerSnapshot {
  return {
    host: `${overrides.name}:11434`,
    totalRamGb: 16,
    isOnline: true,
    loadedModels: [],
    availableModels: [],
    totalVramUsed: 0,
    backendType: "ollama",
    maxConcurrent: 1,
    isDisabled: false,
    ...overrides,
  };
}

function loadedModel(name: string) {
  return {
    name,
    model: name,
    size: 4_000_000_000,
    digest: "abc123",
    details: {
      parent_model: "",
      format: "gguf",
      family: "llama",
      families: ["llama"],
      parameter_size: "8B",
      quantization_level: "Q4_0",
    },
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    size_vram: 4_000_000_000,
    context_length: 8192,
  };
}

function availableModel(name: string) {
  return {
    name,
    model: name,
    modified_at: new Date().toISOString(),
    size: 4_000_000_000,
    digest: "abc123",
    details: {
      parent_model: "",
      format: "gguf",
      family: "llama",
      families: ["llama"],
      parameter_size: "8B",
      quantization_level: "Q4_0",
    },
  };
}

test("busy tracker keeps server busy until all in-flight requests finish", () => {
  const tracker = new BusyRequestTracker();
  const h1 = tracker.markStart(7);
  const h2 = tracker.markStart(7);

  assert.equal(tracker.getInFlightCount(7), 2);
  assert.deepEqual(tracker.getBusyServerIds(), [7]);

  tracker.markEnd(h1);
  assert.equal(tracker.getInFlightCount(7), 1);
  assert.deepEqual(tracker.getBusyServerIds(), [7]);

  tracker.markEnd(h2);
  assert.equal(tracker.getInFlightCount(7), 0);
  assert.deepEqual(tracker.getBusyServerIds(), []);
});

test("markEnd is a no-op for unknown handles", () => {
  const tracker = new BusyRequestTracker();
  tracker.markEnd({ serverId: 99, slotId: 12345 });
  assert.equal(tracker.getInFlightCount(99), 0);
  assert.deepEqual(tracker.getBusyServerIds(), []);
});

test("markEnd is idempotent on the same handle", () => {
  const tracker = new BusyRequestTracker();
  const h = tracker.markStart(1);
  tracker.markEnd(h);
  tracker.markEnd(h); // second call is a no-op
  assert.equal(tracker.getInFlightCount(1), 0);
});

// --- Out-of-order completion: the handle-based API's reason to exist ---

test("out-of-order completion releases the correct slot", () => {
  // Two requests start on server 1; the SECOND finishes first.
  // With the old serverId-only API, markEnd would clear the oldest
  // safety timer (belonging to the first, still-running request).
  // With handles, each markEnd clears its own timer.
  const tracker = new BusyRequestTracker();
  const first = tracker.markStart(1);
  const second = tracker.markStart(1);
  assert.equal(tracker.getInFlightCount(1), 2);

  tracker.markEnd(second);
  assert.equal(tracker.getInFlightCount(1), 1);

  // Now end `first`. If handles were broken, this would be a no-op
  // (because `second` had already cleared `first`'s timer/counter).
  tracker.markEnd(first);
  assert.equal(tracker.getInFlightCount(1), 0);
  assert.deepEqual(tracker.getBusyServerIds(), []);
});

test("auto-released counter starts at 0 and is monotonic", () => {
  const tracker = new BusyRequestTracker();
  assert.equal(tracker.getAutoReleasedCount(), 0);
  // We don't exercise the 5-minute safety timer in unit tests. The counter
  // being 0 is the meaningful invariant — if it ever increments in prod,
  // there is a markEnd leak somewhere in server.ts.
});

// --- getFullServerIds (concurrency-aware) ---

test("getFullServerIds returns empty when all under limit", () => {
  const tracker = new BusyRequestTracker();
  tracker.markStart(1);
  tracker.markStart(1);
  const limits = new Map([[1, 5], [2, 3]]);
  assert.deepEqual(tracker.getFullServerIds(limits), []);
});

test("getFullServerIds returns server at limit", () => {
  const tracker = new BusyRequestTracker();
  tracker.markStart(1);
  tracker.markStart(1);
  tracker.markStart(1);
  const limits = new Map([[1, 3]]);
  assert.deepEqual(tracker.getFullServerIds(limits), [1]);
});

test("getFullServerIds returns server above limit", () => {
  const tracker = new BusyRequestTracker();
  tracker.markStart(1);
  tracker.markStart(1);
  tracker.markStart(1);
  tracker.markStart(1);
  const limits = new Map([[1, 3]]);
  assert.deepEqual(tracker.getFullServerIds(limits), [1]);
});

test("getFullServerIds defaults to limit=1 for unknown servers", () => {
  const tracker = new BusyRequestTracker();
  tracker.markStart(99);
  const limits = new Map<number, number>();
  assert.deepEqual(tracker.getFullServerIds(limits), [99]);
});

test("getFullServerIds with mixed limits", () => {
  const tracker = new BusyRequestTracker();
  tracker.markStart(1);
  tracker.markStart(1);
  tracker.markStart(2);
  const limits = new Map([[1, 5], [2, 1]]);
  assert.deepEqual(tracker.getFullServerIds(limits), [2]);
});

test("getFullServerIds treats vllm-like limit correctly", () => {
  const tracker = new BusyRequestTracker();
  for (let i = 0; i < 9; i++) tracker.markStart(1);
  const limits = new Map([[1, 10]]);
  assert.deepEqual(tracker.getFullServerIds(limits), []);
  tracker.markStart(1); // Now at 10
  assert.deepEqual(tracker.getFullServerIds(limits), [1]);
});

test("busy tracking lifecycle queues on loaded server while busy and serves from it when free", () => {
  const tracker = new BusyRequestTracker();
  const loaded = makeServer({
    id: 1,
    name: "dgx",
    totalRamGb: 128,
    loadedModels: [loadedModel("llama3")],
  });
  const available = makeServer({
    id: 2,
    name: "agx",
    totalRamGb: 64,
    availableModels: [availableModel("llama3")],
  });

  const h = tracker.markStart(loaded.id);
  const whileBusy = selectRoute({
    onlineServers: [loaded, available],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    busyServerIds: tracker.getBusyServerIds(),
  });
  assert.ok(whileBusy);
  assert.equal(whileBusy.server.id, loaded.id);
  assert.equal(whileBusy.reason, "model_loaded_busy");

  tracker.markEnd(h);
  const afterComplete = selectRoute({
    onlineServers: [loaded, available],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    busyServerIds: tracker.getBusyServerIds(),
  });
  assert.ok(afterComplete);
  assert.equal(afterComplete.server.id, loaded.id);
  assert.equal(afterComplete.reason, "model_loaded");
});

// --- Queue system (waitForSlot, isAtCapacity, getQueueLength) ---

test("isAtCapacity returns false when under limit", () => {
  const tracker = new BusyRequestTracker();
  assert.equal(tracker.isAtCapacity(1, 3), false);
  tracker.markStart(1);
  assert.equal(tracker.isAtCapacity(1, 3), false);
  tracker.markStart(1);
  assert.equal(tracker.isAtCapacity(1, 3), false);
});

test("isAtCapacity returns true when at limit", () => {
  const tracker = new BusyRequestTracker();
  tracker.markStart(1);
  assert.equal(tracker.isAtCapacity(1, 1), true);
});

test("isAtCapacity returns true when over limit", () => {
  const tracker = new BusyRequestTracker();
  tracker.markStart(1);
  tracker.markStart(1);
  assert.equal(tracker.isAtCapacity(1, 1), true);
});

test("getQueueLength returns 0 when no waiters", () => {
  const tracker = new BusyRequestTracker();
  assert.equal(tracker.getQueueLength(1), 0);
});

test("waitForSlot resolves immediately when not at capacity", async () => {
  const tracker = new BusyRequestTracker();
  await tracker.waitForSlot(1, 2, 1000);
  assert.ok(true);
});

test("waitForSlot waits and resolves when slot opens", async () => {
  const tracker = new BusyRequestTracker();
  const h = tracker.markStart(1);
  assert.equal(tracker.isAtCapacity(1, 1), true);
  assert.equal(tracker.getQueueLength(1), 0);

  let resolved = false;
  const waitPromise = tracker.waitForSlot(1, 1, 5000).then(() => { resolved = true; });

  assert.equal(tracker.getQueueLength(1), 1);
  assert.equal(resolved, false);

  tracker.markEnd(h);

  await waitPromise;
  assert.equal(resolved, true);
  assert.equal(tracker.getQueueLength(1), 0);
});

test("waitForSlot FIFO order — first waiter gets notified first", async () => {
  const tracker = new BusyRequestTracker();
  const h1 = tracker.markStart(1);

  const order: number[] = [];

  const wait1 = tracker.waitForSlot(1, 1, 5000).then(() => { order.push(1); });
  const wait2 = tracker.waitForSlot(1, 1, 5000).then(() => { order.push(2); });

  assert.equal(tracker.getQueueLength(1), 2);

  tracker.markEnd(h1);
  await wait1;

  const h2 = tracker.markStart(1);
  tracker.markEnd(h2);
  await wait2;

  assert.deepEqual(order, [1, 2]);
});

test("waitForSlot rejects on timeout", async () => {
  const tracker = new BusyRequestTracker();
  tracker.markStart(1);

  try {
    await tracker.waitForSlot(1, 1, 50);
    assert.fail("Should have thrown");
  } catch (err: unknown) {
    assert.ok(err instanceof Error && err.message.includes("Queue timeout"));
  }

  assert.equal(tracker.getQueueLength(1), 0);
});

test("waitForSlot timeout removes only the timed-out waiter", async () => {
  const tracker = new BusyRequestTracker();
  const h = tracker.markStart(1);

  const wait1 = tracker.waitForSlot(1, 1, 50).catch(() => "timeout");
  const wait2Promise = tracker.waitForSlot(1, 1, 5000);

  assert.equal(tracker.getQueueLength(1), 2);

  const result1 = await wait1;
  assert.equal(result1, "timeout");

  assert.equal(tracker.getQueueLength(1), 1);

  tracker.markEnd(h);
  await wait2Promise;
  assert.equal(tracker.getQueueLength(1), 0);
});

test("multiple servers have independent queues", async () => {
  const tracker = new BusyRequestTracker();
  const h1 = tracker.markStart(1);
  const h2 = tracker.markStart(2);

  let resolved1 = false;
  let resolved2 = false;

  const wait1 = tracker.waitForSlot(1, 1, 5000).then(() => { resolved1 = true; });
  const wait2 = tracker.waitForSlot(2, 1, 5000).then(() => { resolved2 = true; });

  assert.equal(tracker.getQueueLength(1), 1);
  assert.equal(tracker.getQueueLength(2), 1);

  tracker.markEnd(h2);
  await wait2;

  assert.equal(resolved1, false);
  assert.equal(resolved2, true);

  tracker.markEnd(h1);
  await wait1;
  assert.equal(resolved1, true);
});
