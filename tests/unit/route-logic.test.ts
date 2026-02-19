import assert from "node:assert/strict";
import test from "node:test";
import {
  freeVram,
  pickByPriority,
  selectRoute,
  type ServerSnapshot,
} from "../../src/proxy/route-logic";

// --- Test helpers ---

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
    details: { parent_model: "", format: "gguf", family: "llama", families: ["llama"], parameter_size: "8B", quantization_level: "Q4_0" },
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
    details: { parent_model: "", format: "gguf", family: "llama", families: ["llama"], parameter_size: "8B", quantization_level: "Q4_0" },
  };
}

const dgx = makeServer({ id: 1, name: "dgx", totalRamGb: 128, host: "10.0.154.246:11434" });
const agx = makeServer({ id: 2, name: "agx", totalRamGb: 64, host: "10.0.154.245:11434" });
const nano1 = makeServer({ id: 3, name: "nano1", totalRamGb: 16, host: "10.0.154.234:11434" });
const nano2 = makeServer({ id: 4, name: "nano2", totalRamGb: 16, host: "10.0.154.244:11434" });

// --- freeVram ---

test("freeVram calculates bytes correctly", () => {
  const server = makeServer({ id: 1, name: "test", totalRamGb: 64, totalVramUsed: 10 * 1024 * 1024 * 1024 });
  const expected = 64 * 1024 * 1024 * 1024 - 10 * 1024 * 1024 * 1024;
  assert.equal(freeVram(server), expected);
});

test("freeVram returns full capacity when nothing used", () => {
  const server = makeServer({ id: 1, name: "test", totalRamGb: 128, totalVramUsed: 0 });
  assert.equal(freeVram(server), 128 * 1024 * 1024 * 1024);
});

// --- pickByPriority ---

test("pickByPriority selects highest RAM server", () => {
  const { server } = pickByPriority([nano1, dgx, agx], 0);
  assert.equal(server.name, "dgx");
});

test("pickByPriority round-robins among tied servers", () => {
  const r0 = pickByPriority([nano1, nano2], 0);
  const r1 = pickByPriority([nano1, nano2], 1);
  assert.notEqual(r0.server.name, r1.server.name);
});

test("pickByPriority works with single candidate", () => {
  const { server, nextCounter } = pickByPriority([agx], 0);
  assert.equal(server.name, "agx");
  assert.equal(nextCounter, 1);
});

test("pickByPriority increments counter", () => {
  const { nextCounter } = pickByPriority([dgx, agx], 5);
  assert.equal(nextCounter, 6);
});

// --- selectRoute ---

test("selectRoute returns null for empty server list", () => {
  const result = selectRoute({
    onlineServers: [],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
  });
  assert.equal(result, null);
});

test("selectRoute picks server with model loaded", () => {
  const dgxLoaded = makeServer({
    ...dgx,
    loadedModels: [loadedModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [nano1, dgxLoaded, agx],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
  });
  assert.ok(result);
  assert.equal(result.server.name, "dgx");
  assert.equal(result.reason, "model_loaded");
});

test("selectRoute picks optimistically loaded server", () => {
  const result = selectRoute({
    onlineServers: [nano1, agx, dgx],
    modelName: "llama3",
    optimisticServerId: agx.id,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
  });
  assert.ok(result);
  assert.equal(result.server.name, "agx");
  assert.equal(result.reason, "model_loaded");
});

test("selectRoute picks server with model available", () => {
  const agxAvail = makeServer({
    ...agx,
    availableModels: [availableModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [nano1, agxAvail, dgx],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
  });
  assert.ok(result);
  assert.equal(result.server.name, "agx");
  assert.equal(result.reason, "model_available");
});

test("selectRoute applies anti-churn when model available on multiple servers", () => {
  const nano1Avail = makeServer({
    ...nano1,
    availableModels: [availableModel("llama3")],
  });
  const nano2Avail = makeServer({
    ...nano2,
    availableModels: [availableModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [nano1Avail, nano2Avail],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: nano1.id,
    roundRobinCounter: 0,
  });
  assert.ok(result);
  assert.equal(result.server.name, "nano2");
  assert.equal(result.reason, "model_available_anti_churn");
});

test("selectRoute skips anti-churn when only one server has model", () => {
  const nano1Avail = makeServer({
    ...nano1,
    availableModels: [availableModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [nano1Avail, nano2],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: nano1.id,
    roundRobinCounter: 0,
  });
  assert.ok(result);
  assert.equal(result.server.name, "nano1");
  assert.equal(result.reason, "model_available");
});

test("selectRoute falls back to most VRAM when model not found", () => {
  const result = selectRoute({
    onlineServers: [nano1, agx, dgx],
    modelName: "unknown-model",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
  });
  assert.ok(result);
  assert.equal(result.server.name, "dgx");
  assert.equal(result.reason, "fallback_most_vram");
});

test("selectRoute prefers loaded over available", () => {
  const nano1Loaded = makeServer({
    ...nano1,
    loadedModels: [loadedModel("llama3")],
  });
  const dgxAvail = makeServer({
    ...dgx,
    availableModels: [availableModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [nano1Loaded, dgxAvail],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
  });
  assert.ok(result);
  assert.equal(result.server.name, "nano1");
  assert.equal(result.reason, "model_loaded");
});

// --- busy-aware routing ---

test("selectRoute skips busy loaded server when model available elsewhere", () => {
  const dgxLoaded = makeServer({
    ...dgx,
    loadedModels: [loadedModel("llama3")],
  });
  const agxAvail = makeServer({
    ...agx,
    availableModels: [availableModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [dgxLoaded, agxAvail],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    busyServerIds: [dgx.id],
  });
  assert.ok(result);
  assert.equal(result.server.name, "agx");
  assert.equal(result.reason, "model_available_busy_redirect");
});

test("selectRoute falls back to busy loaded server when no alternatives", () => {
  const dgxLoaded = makeServer({
    ...dgx,
    loadedModels: [loadedModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [dgxLoaded, nano1],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    busyServerIds: [dgx.id],
  });
  assert.ok(result);
  assert.equal(result.server.name, "dgx");
  assert.equal(result.reason, "model_loaded_busy");
});

test("selectRoute unaffected when busyServerIds is empty", () => {
  const dgxLoaded = makeServer({
    ...dgx,
    loadedModels: [loadedModel("llama3")],
  });
  const agxAvail = makeServer({
    ...agx,
    availableModels: [availableModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [dgxLoaded, agxAvail],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    busyServerIds: [],
  });
  assert.ok(result);
  assert.equal(result.server.name, "dgx");
  assert.equal(result.reason, "model_loaded");
});

test("selectRoute prefers free loaded server over busy loaded server", () => {
  const dgxLoaded = makeServer({
    ...dgx,
    loadedModels: [loadedModel("llama3")],
  });
  const agxLoaded = makeServer({
    ...agx,
    loadedModels: [loadedModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [dgxLoaded, agxLoaded],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    busyServerIds: [dgx.id],
  });
  assert.ok(result);
  assert.equal(result.server.name, "agx");
  assert.equal(result.reason, "model_loaded");
});

// --- sticky model affinity ---

test("selectRoute sticky hit when lastRouted is in loaded+free set", () => {
  const dgxLoaded = makeServer({
    ...dgx,
    loadedModels: [loadedModel("llama3")],
  });
  const agxLoaded = makeServer({
    ...agx,
    loadedModels: [loadedModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [dgxLoaded, agxLoaded],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: agx.id,
    roundRobinCounter: 0,
  });
  assert.ok(result);
  assert.equal(result.server.name, "agx");
  assert.equal(result.reason, "model_loaded_sticky");
});

test("selectRoute sticky does not increment counter", () => {
  const dgxLoaded = makeServer({
    ...dgx,
    loadedModels: [loadedModel("llama3")],
  });
  const agxLoaded = makeServer({
    ...agx,
    loadedModels: [loadedModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [dgxLoaded, agxLoaded],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: dgx.id,
    roundRobinCounter: 5,
  });
  assert.ok(result);
  assert.equal(result.roundRobinCounter, 5);
  assert.equal(result.reason, "model_loaded_sticky");
});

test("selectRoute sticky falls back to pickByPriority when lastRouted not in loaded set", () => {
  const dgxLoaded = makeServer({
    ...dgx,
    loadedModels: [loadedModel("llama3")],
  });
  const agxLoaded = makeServer({
    ...agx,
    loadedModels: [loadedModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [dgxLoaded, agxLoaded],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: nano1.id,
    roundRobinCounter: 0,
  });
  assert.ok(result);
  assert.equal(result.server.name, "dgx");
  assert.equal(result.reason, "model_loaded");
});

test("selectRoute sticky does not apply when sticky server is busy", () => {
  const dgxLoaded = makeServer({
    ...dgx,
    loadedModels: [loadedModel("llama3")],
  });
  const agxLoaded = makeServer({
    ...agx,
    loadedModels: [loadedModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [dgxLoaded, agxLoaded],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: dgx.id,
    roundRobinCounter: 0,
    busyServerIds: [dgx.id],
  });
  assert.ok(result);
  assert.equal(result.server.name, "agx");
  assert.equal(result.reason, "model_loaded");
});

test("selectRoute sticky works with single loaded server", () => {
  const dgxLoaded = makeServer({
    ...dgx,
    loadedModels: [loadedModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [dgxLoaded, agx],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: dgx.id,
    roundRobinCounter: 0,
  });
  assert.ok(result);
  assert.equal(result.server.name, "dgx");
  assert.equal(result.reason, "model_loaded_sticky");
});

// --- endpoint filtering by backend type ---

test("selectRoute filters vllm out for /api/chat", () => {
  const vllmServer = makeServer({
    id: 10,
    name: "vllm-dgx",
    totalRamGb: 128,
    backendType: "vllm",
    loadedModels: [loadedModel("meta-llama/Llama-2-7b")],
  });
  const ollamaServer = makeServer({
    ...nano1,
    availableModels: [availableModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [vllmServer, ollamaServer],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    endpointPath: "/api/chat",
  });
  assert.ok(result);
  assert.equal(result.server.name, "nano1");
});

test("selectRoute includes vllm for /v1/chat/completions", () => {
  const vllmServer = makeServer({
    id: 10,
    name: "vllm-dgx",
    totalRamGb: 128,
    backendType: "vllm",
    loadedModels: [loadedModel("meta-llama/Llama-2-7b")],
  });
  const result = selectRoute({
    onlineServers: [vllmServer],
    modelName: "meta-llama/Llama-2-7b",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    endpointPath: "/v1/chat/completions",
  });
  assert.ok(result);
  assert.equal(result.server.name, "vllm-dgx");
  assert.equal(result.reason, "model_loaded");
});

test("selectRoute returns null when only vllm servers and /api/generate", () => {
  const vllmServer = makeServer({
    id: 10,
    name: "vllm-dgx",
    totalRamGb: 128,
    backendType: "vllm",
    loadedModels: [loadedModel("meta-llama/Llama-2-7b")],
  });
  const result = selectRoute({
    onlineServers: [vllmServer],
    modelName: "meta-llama/Llama-2-7b",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    endpointPath: "/api/generate",
  });
  assert.equal(result, null);
});

test("selectRoute no filter when endpointPath is null", () => {
  const vllmServer = makeServer({
    id: 10,
    name: "vllm-dgx",
    totalRamGb: 128,
    backendType: "vllm",
    loadedModels: [loadedModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [vllmServer],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    endpointPath: null,
  });
  assert.ok(result);
  assert.equal(result.server.name, "vllm-dgx");
});

test("selectRoute filters generic backends for /api/ endpoints", () => {
  const genericServer = makeServer({
    id: 11,
    name: "generic-proxy",
    totalRamGb: 32,
    backendType: "generic",
  });
  const ollamaServer = makeServer({
    ...nano1,
    availableModels: [availableModel("llama3")],
  });
  const result = selectRoute({
    onlineServers: [genericServer, ollamaServer],
    modelName: "llama3",
    optimisticServerId: null,
    lastRoutedServerId: null,
    roundRobinCounter: 0,
    endpointPath: "/api/embed",
  });
  assert.ok(result);
  assert.equal(result.server.name, "nano1");
});
