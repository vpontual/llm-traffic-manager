import assert from "node:assert/strict";
import test from "node:test";
import { extractModel } from "../../src/proxy/parse";

test("extractModel parses model field from JSON body", () => {
  const body = Buffer.from(JSON.stringify({ model: "llama3:8b", prompt: "hello" }));
  assert.equal(extractModel(body), "llama3:8b");
});

test("extractModel parses name field (used by /api/copy and /api/create)", () => {
  const body = Buffer.from(JSON.stringify({ name: "my-custom-model" }));
  assert.equal(extractModel(body), "my-custom-model");
});

test("extractModel prefers model over name when both present", () => {
  const body = Buffer.from(JSON.stringify({ model: "llama3", name: "other" }));
  assert.equal(extractModel(body), "llama3");
});

test("extractModel returns null for empty body", () => {
  assert.equal(extractModel(Buffer.alloc(0)), null);
});

test("extractModel returns null for invalid JSON", () => {
  assert.equal(extractModel(Buffer.from("not json")), null);
});

test("extractModel returns null when no model or name field", () => {
  const body = Buffer.from(JSON.stringify({ prompt: "hello" }));
  assert.equal(extractModel(body), null);
});

test("extractModel handles OpenAI-format request", () => {
  const body = Buffer.from(JSON.stringify({
    model: "qwen3:8b",
    messages: [{ role: "user", content: "hi" }],
  }));
  assert.equal(extractModel(body), "qwen3:8b");
});
