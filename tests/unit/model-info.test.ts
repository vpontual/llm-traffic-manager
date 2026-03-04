import assert from "node:assert/strict";
import test from "node:test";
import { parseOllamaComHtml, getInfoFetchStatus, type ModelInfo } from "../../src/lib/model-info-parse";

// --- parseOllamaComHtml tests ---

test("parseOllamaComHtml extracts description from meta tag", () => {
  const html = `<html><head><meta name="description" content="Qwen3.5 is the latest generation language model"></head></html>`;
  const result = parseOllamaComHtml(html);
  assert.equal(result.description, "Qwen3.5 is the latest generation language model");
});

test("parseOllamaComHtml returns null description when no meta tag", () => {
  const html = `<html><head><title>Test</title></head></html>`;
  const result = parseOllamaComHtml(html);
  assert.equal(result.description, null);
});

test("parseOllamaComHtml extracts capabilities from badge spans", () => {
  const html = `
    <html><head><meta name="description" content="A model"></head><body>
    <span class="badge">Tools</span>
    <span class="tag">Vision</span>
    </body></html>
  `;
  const result = parseOllamaComHtml(html);
  assert.ok(result.capabilities.includes("tools"));
  assert.ok(result.capabilities.includes("vision"));
});

test("parseOllamaComHtml falls back to description for capabilities", () => {
  const html = `<html><head><meta name="description" content="A powerful code and vision model with tools support"></head><body></body></html>`;
  const result = parseOllamaComHtml(html);
  assert.ok(result.capabilities.includes("code"));
  assert.ok(result.capabilities.includes("vision"));
  assert.ok(result.capabilities.includes("tools"));
});

test("parseOllamaComHtml detects thinking capability", () => {
  const html = `<html><head><meta name="description" content="A thinking model for reasoning"></head></html>`;
  const result = parseOllamaComHtml(html);
  assert.ok(result.capabilities.includes("thinking"));
});

test("parseOllamaComHtml detects embedding capability", () => {
  const html = `<html><head><meta name="description" content="An embedding model for vector search"></head></html>`;
  const result = parseOllamaComHtml(html);
  assert.ok(result.capabilities.includes("embedding"));
});

test("parseOllamaComHtml extracts pull count", () => {
  const html = `<html><body><span>22.5M Pulls</span></body></html>`;
  const result = parseOllamaComHtml(html);
  assert.equal(result.pullCount, "22.5M");
});

test("parseOllamaComHtml returns null pull count when not present", () => {
  const html = `<html><body><p>No pull info</p></body></html>`;
  const result = parseOllamaComHtml(html);
  assert.equal(result.pullCount, null);
});

test("parseOllamaComHtml returns empty capabilities for plain model", () => {
  const html = `<html><head><meta name="description" content="A general purpose model"></head></html>`;
  const result = parseOllamaComHtml(html);
  assert.deepEqual(result.capabilities, []);
});

test("parseOllamaComHtml handles empty HTML", () => {
  const result = parseOllamaComHtml("");
  assert.equal(result.description, null);
  assert.deepEqual(result.capabilities, []);
  assert.equal(result.pullCount, null);
});

// --- getInfoFetchStatus tests ---

test("getInfoFetchStatus returns success when both sources available", () => {
  const info: ModelInfo = {
    ollamaCom: { description: "test", capabilities: [], pullCount: null },
    registry: { modelFamily: "qwen3", families: [], modelType: null, fileType: null },
    registryExists: true,
  };
  assert.equal(getInfoFetchStatus(info), "success");
});

test("getInfoFetchStatus returns partial when only ollamaCom available", () => {
  const info: ModelInfo = {
    ollamaCom: { description: "test", capabilities: [], pullCount: null },
    registry: null,
    registryExists: false,
  };
  assert.equal(getInfoFetchStatus(info), "partial");
});

test("getInfoFetchStatus returns partial when only registry available", () => {
  const info: ModelInfo = {
    ollamaCom: null,
    registry: { modelFamily: "qwen3", families: [], modelType: null, fileType: null },
    registryExists: true,
  };
  assert.equal(getInfoFetchStatus(info), "partial");
});

test("getInfoFetchStatus returns failed when neither available", () => {
  const info: ModelInfo = {
    ollamaCom: null,
    registry: null,
    registryExists: false,
  };
  assert.equal(getInfoFetchStatus(info), "failed");
});
