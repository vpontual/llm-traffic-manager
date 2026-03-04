import assert from "node:assert/strict";
import test from "node:test";
import {
  findServiceAffinities,
  buildModelFamilyMap,
  parseBaseFamily,
  findFamilyOverlap,
  type SourceModelUsage,
} from "../../src/lib/service-affinity";

// --- parseBaseFamily tests ---

test("parseBaseFamily strips tag", () => {
  assert.equal(parseBaseFamily("qwen3:8b"), "qwen3");
});

test("parseBaseFamily strips instruct suffix", () => {
  assert.equal(parseBaseFamily("llama3.2:70b-instruct"), "llama3.2");
});

test("parseBaseFamily strips chat suffix", () => {
  assert.equal(parseBaseFamily("deepseek-coder:6.7b-chat"), "deepseek");
});

test("parseBaseFamily handles name without tag", () => {
  assert.equal(parseBaseFamily("llama3"), "llama3");
});

test("parseBaseFamily handles name with vision suffix", () => {
  assert.equal(parseBaseFamily("llava:13b-vision-v1"), "llava");
});

// --- findFamilyOverlap tests ---

test("findFamilyOverlap finds exact match", () => {
  const result = findFamilyOverlap(["qwen3"], null, ["qwen3"], null);
  assert.equal(result, "qwen3");
});

test("findFamilyOverlap finds prefix match (discovery is prefix)", () => {
  const result = findFamilyOverlap(["qwen3"], null, ["qwen3.5"], null);
  assert.equal(result, "qwen3");
});

test("findFamilyOverlap finds prefix match (target is prefix)", () => {
  const result = findFamilyOverlap(["qwen3.5"], null, ["qwen3"], null);
  assert.equal(result, "qwen3");
});

test("findFamilyOverlap returns null when no overlap", () => {
  const result = findFamilyOverlap(["qwen3"], null, ["llama3"], null);
  assert.equal(result, null);
});

test("findFamilyOverlap uses family field as fallback", () => {
  const result = findFamilyOverlap([], "qwen3", [], "qwen3");
  assert.equal(result, "qwen3");
});

test("findFamilyOverlap handles empty inputs", () => {
  const result = findFamilyOverlap([], null, [], null);
  assert.equal(result, null);
});

// --- buildModelFamilyMap tests ---

test("buildModelFamilyMap creates map from discovery data", () => {
  const map = buildModelFamilyMap([
    { modelName: "qwen3:8b", modelFamily: "qwen3", families: ["qwen3"] },
    { modelName: "llama3.2:70b", modelFamily: "llama", families: ["llama", "llama3.2"] },
  ]);
  assert.equal(map.size, 2);
  assert.deepEqual(map.get("qwen3:8b"), { family: "qwen3", families: ["qwen3"] });
  assert.deepEqual(map.get("llama3.2:70b"), { family: "llama", families: ["llama", "llama3.2"] });
});

test("buildModelFamilyMap handles empty input", () => {
  const map = buildModelFamilyMap([]);
  assert.equal(map.size, 0);
});

// --- findServiceAffinities tests ---

test("findServiceAffinities finds affinities for same family", () => {
  const usage: SourceModelUsage[] = [
    { source: "10.0.1.50", model: "qwen3:8b", requestCount: 523 },
    { source: "10.0.1.60", model: "llama3.2:70b", requestCount: 100 },
  ];

  const familyMap = buildModelFamilyMap([
    { modelName: "qwen3:8b", modelFamily: "qwen3", families: ["qwen3"] },
  ]);

  const result = findServiceAffinities(
    "qwen3",
    ["qwen3", "qwen3.5"],
    "qwen3.5:8b",
    usage,
    familyMap
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].source, "10.0.1.50");
  assert.equal(result[0].currentModel, "qwen3:8b");
  assert.equal(result[0].requestCount, 523);
});

test("findServiceAffinities skips exact same model", () => {
  const usage: SourceModelUsage[] = [
    { source: "10.0.1.50", model: "qwen3:8b", requestCount: 100 },
  ];

  const familyMap = buildModelFamilyMap([
    { modelName: "qwen3:8b", modelFamily: "qwen3", families: ["qwen3"] },
  ]);

  const result = findServiceAffinities(
    "qwen3",
    ["qwen3"],
    "qwen3:8b", // same model
    usage,
    familyMap
  );

  assert.equal(result.length, 0);
});

test("findServiceAffinities returns empty for unrelated families", () => {
  const usage: SourceModelUsage[] = [
    { source: "10.0.1.50", model: "llama3.2:70b", requestCount: 100 },
  ];

  const familyMap = buildModelFamilyMap([
    { modelName: "llama3.2:70b", modelFamily: "llama", families: ["llama", "llama3.2"] },
  ]);

  const result = findServiceAffinities(
    "qwen3",
    ["qwen3"],
    "qwen3:8b",
    usage,
    familyMap
  );

  assert.equal(result.length, 0);
});

test("findServiceAffinities sorts by request count descending", () => {
  const usage: SourceModelUsage[] = [
    { source: "10.0.1.50", model: "qwen3:8b", requestCount: 100 },
    { source: "10.0.1.60", model: "qwen3:32b", requestCount: 500 },
  ];

  const familyMap = buildModelFamilyMap([
    { modelName: "qwen3:8b", modelFamily: "qwen3", families: ["qwen3"] },
    { modelName: "qwen3:32b", modelFamily: "qwen3", families: ["qwen3"] },
  ]);

  const result = findServiceAffinities(
    "qwen3",
    ["qwen3", "qwen3.5"],
    "qwen3.5:8b",
    usage,
    familyMap
  );

  assert.equal(result.length, 2);
  assert.equal(result[0].requestCount, 500);
  assert.equal(result[1].requestCount, 100);
});

test("findServiceAffinities uses base-name fallback for unknown models", () => {
  const usage: SourceModelUsage[] = [
    { source: "10.0.1.50", model: "qwen3:8b", requestCount: 200 },
  ];

  // Empty family map -- should fall back to parseBaseFamily
  const familyMap = buildModelFamilyMap([]);

  const result = findServiceAffinities(
    "qwen3",
    ["qwen3", "qwen3.5"],
    "qwen3.5:8b",
    usage,
    familyMap
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].currentModel, "qwen3:8b");
});

test("findServiceAffinities handles empty usage", () => {
  const result = findServiceAffinities(
    "qwen3",
    ["qwen3"],
    "qwen3:8b",
    [],
    new Map()
  );
  assert.deepEqual(result, []);
});
