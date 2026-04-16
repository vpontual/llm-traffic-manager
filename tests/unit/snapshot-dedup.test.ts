import assert from "node:assert/strict";
import test from "node:test";
import { computeSnapshotSignature } from "../../src/lib/snapshot-dedup";
import type { OllamaRunningModel, OllamaAvailableModel } from "../../src/lib/types";

const baseDetails = {
  parent_model: "",
  format: "gguf",
  family: "qwen",
  families: ["qwen"],
  parameter_size: "35B",
  quantization_level: "Q4_K_M",
};

function loaded(name: string, expires_at = "2026-04-16T12:00:00Z"): OllamaRunningModel {
  return {
    name,
    model: name,
    size: 20_000_000_000,
    digest: "d1",
    details: baseDetails,
    expires_at,
    size_vram: 20_000_000_000,
    context_length: 8192,
  };
}

function available(name: string): OllamaAvailableModel {
  return {
    name,
    model: name,
    modified_at: "2026-04-01T00:00:00Z",
    size: 20_000_000_000,
    digest: "d1",
    details: baseDetails,
  };
}

test("identical state produces identical signature", () => {
  const state = {
    isOnline: true,
    ollamaVersion: "0.5.0",
    loadedModels: [loaded("qwen3.5:35b")],
    availableModels: [available("qwen3.5:35b"), available("gemma3:4b")],
  };
  assert.equal(computeSnapshotSignature(state), computeSnapshotSignature(state));
});

test("expires_at changes do NOT change the signature (volatile field stripped)", () => {
  const a = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: "0.5.0",
    loadedModels: [loaded("qwen3.5:35b", "2026-04-16T12:00:00Z")],
    availableModels: [],
  });
  const b = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: "0.5.0",
    loadedModels: [loaded("qwen3.5:35b", "2026-04-16T12:29:30Z")],
    availableModels: [],
  });
  assert.equal(a, b);
});

test("loading a new model changes the signature", () => {
  const a = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: "0.5.0",
    loadedModels: [],
    availableModels: [available("qwen3.5:35b")],
  });
  const b = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: "0.5.0",
    loadedModels: [loaded("qwen3.5:35b")],
    availableModels: [available("qwen3.5:35b")],
  });
  assert.notEqual(a, b);
});

test("model order does not affect signature (sorted by name)", () => {
  const a = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: "0.5.0",
    loadedModels: [],
    availableModels: [available("qwen3.5:35b"), available("gemma3:4b")],
  });
  const b = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: "0.5.0",
    loadedModels: [],
    availableModels: [available("gemma3:4b"), available("qwen3.5:35b")],
  });
  assert.equal(a, b);
});

test("isOnline flip changes the signature", () => {
  const a = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: "0.5.0",
    loadedModels: [],
    availableModels: [],
  });
  const b = computeSnapshotSignature({
    isOnline: false,
    ollamaVersion: "0.5.0",
    loadedModels: [],
    availableModels: [],
  });
  assert.notEqual(a, b);
});

test("ollamaVersion change triggers new signature", () => {
  const a = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: "0.5.0",
    loadedModels: [],
    availableModels: [],
  });
  const b = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: "0.5.1",
    loadedModels: [],
    availableModels: [],
  });
  assert.notEqual(a, b);
});

test("null vs missing ollamaVersion normalize to the same signature", () => {
  const a = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: null,
    loadedModels: [],
    availableModels: [],
  });
  const b = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: undefined,
    loadedModels: [],
    availableModels: [],
  });
  assert.equal(a, b);
});

test("size_vram change (e.g. partial reload) changes the signature", () => {
  const a = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: "0.5.0",
    loadedModels: [{ ...loaded("m"), size_vram: 1_000_000 }],
    availableModels: [],
  });
  const b = computeSnapshotSignature({
    isOnline: true,
    ollamaVersion: "0.5.0",
    loadedModels: [{ ...loaded("m"), size_vram: 2_000_000 }],
    availableModels: [],
  });
  assert.notEqual(a, b);
});
