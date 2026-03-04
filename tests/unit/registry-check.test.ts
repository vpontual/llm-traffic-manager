import assert from "node:assert/strict";
import test from "node:test";
import {
  parseModelName,
  clearRegistryCache,
  getRegistryCacheSize,
  checkOllamaRegistry,
  checkHuggingFace,
  checkModelRegistry,
} from "../../src/lib/registry-check";

test("parseModelName parses name with tag", () => {
  const result = parseModelName("llama3.2:8b");
  assert.deepEqual(result, { library: "llama3.2", tag: "8b" });
});

test("parseModelName defaults to latest tag", () => {
  const result = parseModelName("llama3.2");
  assert.deepEqual(result, { library: "llama3.2", tag: "latest" });
});

test("parseModelName returns null for HuggingFace hf.co format", () => {
  const result = parseModelName("hf.co/user/repo:q4");
  assert.equal(result, null);
});

test("parseModelName returns null for slash-containing names", () => {
  const result = parseModelName("user/model");
  assert.equal(result, null);
});

test("parseModelName returns null for empty string", () => {
  const result = parseModelName("");
  assert.equal(result, null);
});

test("parseModelName handles name with tag only (first colon split)", () => {
  const result = parseModelName("model:tag");
  assert.notEqual(result, null);
  assert.equal(result!.library, "model");
  assert.equal(result!.tag, "tag");
});

test("clearRegistryCache resets cache", () => {
  clearRegistryCache();
  assert.equal(getRegistryCacheSize(), 0);
});

test("getRegistryCacheSize returns zero on fresh cache", () => {
  clearRegistryCache();
  assert.equal(getRegistryCacheSize(), 0);
});

// --- Network function tests (with fetch mocking) ---

function mockFetch(impl: (url: string, opts?: unknown) => Promise<{ status: number; ok: boolean; json?: () => Promise<unknown>; text?: () => Promise<string> }>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof globalThis.fetch;
  return () => { globalThis.fetch = original; };
}

test("checkOllamaRegistry returns true on 200", async () => {
  const restore = mockFetch(async () => ({ status: 200, ok: true }));
  try {
    const result = await checkOllamaRegistry("llama3", "8b");
    assert.equal(result, true);
  } finally {
    restore();
  }
});

test("checkOllamaRegistry returns false on non-200", async () => {
  const restore = mockFetch(async () => ({ status: 404, ok: false }));
  try {
    const result = await checkOllamaRegistry("nonexistent", "latest");
    assert.equal(result, false);
  } finally {
    restore();
  }
});

test("checkOllamaRegistry returns false on network error", async () => {
  const restore = mockFetch(async () => { throw new Error("network error"); });
  try {
    const result = await checkOllamaRegistry("llama3", "8b");
    assert.equal(result, false);
  } finally {
    restore();
  }
});

test("checkHuggingFace returns true on 200", async () => {
  const restore = mockFetch(async () => ({ status: 200, ok: true }));
  try {
    const result = await checkHuggingFace("user/repo");
    assert.equal(result, true);
  } finally {
    restore();
  }
});

test("checkHuggingFace returns false on 404", async () => {
  const restore = mockFetch(async () => ({ status: 404, ok: false }));
  try {
    const result = await checkHuggingFace("user/nonexistent");
    assert.equal(result, false);
  } finally {
    restore();
  }
});

test("checkHuggingFace strips hf.co/ prefix and tag", async () => {
  let capturedUrl = "";
  const restore = mockFetch(async (url: string) => {
    capturedUrl = url;
    return { status: 200, ok: true };
  });
  try {
    await checkHuggingFace("hf.co/user/repo:q4");
    assert.ok(capturedUrl.includes("user/repo"));
    assert.ok(!capturedUrl.includes("hf.co"));
    assert.ok(!capturedUrl.includes(":q4"));
  } finally {
    restore();
  }
});

test("checkHuggingFace returns false on network error", async () => {
  const restore = mockFetch(async () => { throw new Error("timeout"); });
  try {
    const result = await checkHuggingFace("user/repo");
    assert.equal(result, false);
  } finally {
    restore();
  }
});

test("checkModelRegistry returns cached result on second call", async () => {
  clearRegistryCache();
  let fetchCount = 0;
  const restore = mockFetch(async () => {
    fetchCount++;
    return { status: 200, ok: true };
  });
  try {
    const first = await checkModelRegistry("test-model:latest");
    assert.equal(first.existsOnOllama, true);
    assert.equal(first.isCustom, false);

    const second = await checkModelRegistry("test-model:latest");
    assert.equal(second.existsOnOllama, true);
    assert.equal(fetchCount, 1); // Should use cache
  } finally {
    restore();
    clearRegistryCache();
  }
});

test("checkModelRegistry dispatches to HuggingFace for slash names", async () => {
  clearRegistryCache();
  const restore = mockFetch(async () => ({ status: 200, ok: true }));
  try {
    const result = await checkModelRegistry("user/model");
    assert.equal(result.existsOnHuggingFace, true);
    assert.equal(result.existsOnOllama, false);
    assert.equal(result.isCustom, false);
  } finally {
    restore();
    clearRegistryCache();
  }
});

test("checkModelRegistry marks as custom when both checks fail", async () => {
  clearRegistryCache();
  const restore = mockFetch(async () => ({ status: 404, ok: false }));
  try {
    const result = await checkModelRegistry("custom-model:v1");
    assert.equal(result.existsOnOllama, false);
    assert.equal(result.existsOnHuggingFace, false);
    assert.equal(result.isCustom, true);
  } finally {
    restore();
    clearRegistryCache();
  }
});
