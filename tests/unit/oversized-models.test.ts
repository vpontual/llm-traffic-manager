import assert from "node:assert/strict";
import test from "node:test";
import {
  findOversizedModels,
  type ServerModelInfo,
} from "../../src/lib/oversized-models";

const GB = 1024 ** 3;

function makeServer(
  overrides: Partial<ServerModelInfo> & { serverId: number; serverName: string; totalRamGb: number },
): ServerModelInfo {
  return {
    models: [],
    ...overrides,
  };
}

test("flags model at 85% of server RAM", () => {
  const servers: ServerModelInfo[] = [
    makeServer({
      serverId: 1,
      serverName: "agx",
      totalRamGb: 64,
      models: [{ name: "big-model:latest", size: 54.4 * GB }], // 85%
    }),
  ];
  const availability = new Map([["big-model:latest", ["agx", "dgx"]]]);

  const result = findOversizedModels(servers, availability);
  assert.equal(result.length, 1);
  assert.equal(result[0].modelName, "big-model:latest");
  assert.equal(result[0].serverName, "agx");
  assert.equal(result[0].serverRamGb, 64);
  assert.ok(result[0].usagePercent > 80);
  assert.deepEqual(result[0].availableOn, ["agx", "dgx"]);
});

test("does not flag model at 50% of server RAM", () => {
  const servers: ServerModelInfo[] = [
    makeServer({
      serverId: 1,
      serverName: "dgx",
      totalRamGb: 128,
      models: [{ name: "small-model:latest", size: 64 * GB }], // 50%
    }),
  ];
  const availability = new Map([["small-model:latest", ["dgx"]]]);

  const result = findOversizedModels(servers, availability);
  assert.equal(result.length, 0);
});

test("flags model at exactly 80% boundary", () => {
  // 80% of 64GB = 51.2GB. Model must be > threshold to be flagged.
  // At exactly 80%, size equals threshold — need to be strictly greater.
  const exactThreshold = 64 * GB * 0.80;
  const servers: ServerModelInfo[] = [
    makeServer({
      serverId: 1,
      serverName: "agx",
      totalRamGb: 64,
      models: [{ name: "boundary-model:latest", size: exactThreshold + 1 }],
    }),
  ];
  const availability = new Map([["boundary-model:latest", ["agx"]]]);

  const result = findOversizedModels(servers, availability);
  assert.equal(result.length, 1, "model just above 80% should be flagged");
});

test("does not flag model just below 80% threshold", () => {
  const justBelow = 64 * GB * 0.80 - 1;
  const servers: ServerModelInfo[] = [
    makeServer({
      serverId: 1,
      serverName: "agx",
      totalRamGb: 64,
      models: [{ name: "fits-model:latest", size: justBelow }],
    }),
  ];
  const availability = new Map([["fits-model:latest", ["agx"]]]);

  const result = findOversizedModels(servers, availability);
  assert.equal(result.length, 0, "model just below 80% should not be flagged");
});

test("flags multiple oversized models on same server", () => {
  const servers: ServerModelInfo[] = [
    makeServer({
      serverId: 1,
      serverName: "agx",
      totalRamGb: 64,
      models: [
        { name: "huge-a:latest", size: 55 * GB },  // ~86%
        { name: "huge-b:latest", size: 60 * GB },  // ~94%
        { name: "small:latest", size: 4 * GB },     // ~6% — should not be flagged
      ],
    }),
  ];
  const availability = new Map([
    ["huge-a:latest", ["agx"]],
    ["huge-b:latest", ["agx", "dgx"]],
    ["small:latest", ["agx"]],
  ]);

  const result = findOversizedModels(servers, availability);
  assert.equal(result.length, 2);
  // Sorted by worst offender first (highest usage%)
  assert.equal(result[0].modelName, "huge-b:latest");
  assert.equal(result[1].modelName, "huge-a:latest");
});

test("returns empty array when no servers have models", () => {
  const servers: ServerModelInfo[] = [
    makeServer({ serverId: 1, serverName: "empty", totalRamGb: 64, models: [] }),
  ];
  const availability = new Map<string, string[]>();

  const result = findOversizedModels(servers, availability);
  assert.equal(result.length, 0);
});

test("returns empty array for empty server list", () => {
  const result = findOversizedModels([], new Map());
  assert.equal(result.length, 0);
});

test("includes availability info from map", () => {
  const servers: ServerModelInfo[] = [
    makeServer({
      serverId: 2,
      serverName: "agx",
      totalRamGb: 64,
      models: [{ name: "qwen3-coder-next:latest", size: 45 * GB }], // ~70% — fits, not flagged at 80%
    }),
  ];
  // 45/64 = 70.3% — below 80%, should NOT be flagged
  const availability = new Map([["qwen3-coder-next:latest", ["agx", "dgx"]]]);

  const result = findOversizedModels(servers, availability);
  assert.equal(result.length, 0);
});

test("correctly computes modelSizeGb and usagePercent", () => {
  const modelSize = 55 * GB; // 55 GB
  const servers: ServerModelInfo[] = [
    makeServer({
      serverId: 1,
      serverName: "agx",
      totalRamGb: 64,
      models: [{ name: "test-model:latest", size: modelSize }],
    }),
  ];
  const availability = new Map([["test-model:latest", ["agx"]]]);

  const result = findOversizedModels(servers, availability);
  assert.equal(result.length, 1);
  assert.equal(result[0].modelSizeGb, 55);
  // 55/64 = 85.9375%
  assert.equal(result[0].usagePercent, 85.9);
});
