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
  tracker.markStart(7);
  tracker.markStart(7);

  assert.equal(tracker.getInFlightCount(7), 2);
  assert.deepEqual(tracker.getBusyServerIds(), [7]);

  tracker.markEnd(7);
  assert.equal(tracker.getInFlightCount(7), 1);
  assert.deepEqual(tracker.getBusyServerIds(), [7]);

  tracker.markEnd(7);
  assert.equal(tracker.getInFlightCount(7), 0);
  assert.deepEqual(tracker.getBusyServerIds(), []);
});

test("busy tracker ignores extra markEnd calls", () => {
  const tracker = new BusyRequestTracker();
  tracker.markEnd(99);
  assert.equal(tracker.getInFlightCount(99), 0);
  assert.deepEqual(tracker.getBusyServerIds(), []);
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
  // Server 1: 2 in-flight, limit 5 → not full
  tracker.markStart(1);
  tracker.markStart(1);
  // Server 2: 1 in-flight, limit 1 → full
  tracker.markStart(2);
  const limits = new Map([[1, 5], [2, 1]]);
  const full = tracker.getFullServerIds(limits);
  assert.deepEqual(full, [2]);
});

test("getFullServerIds treats vllm-like limit correctly", () => {
  const tracker = new BusyRequestTracker();
  // Simulate vllm server with high concurrency limit
  for (let i = 0; i < 9; i++) tracker.markStart(1);
  const limits = new Map([[1, 10]]);
  assert.deepEqual(tracker.getFullServerIds(limits), []);
  tracker.markStart(1); // Now at 10
  assert.deepEqual(tracker.getFullServerIds(limits), [1]);
});

test("busy tracking lifecycle redirects while busy and restores loaded preference when free", () => {
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

  tracker.markStart(loaded.id);
  const whileBusy = selectRoute({
    onlineServers: [loaded, available],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    busyServerIds: tracker.getBusyServerIds(),
  });
  assert.ok(whileBusy);
  assert.equal(whileBusy.server.id, available.id);
  assert.equal(whileBusy.reason, "model_available_busy_redirect");

  tracker.markEnd(loaded.id);
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
