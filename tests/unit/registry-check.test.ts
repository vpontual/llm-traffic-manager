import assert from "node:assert/strict";
import test from "node:test";
import {
  parseModelName,
  clearRegistryCache,
  getRegistryCacheSize,
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
