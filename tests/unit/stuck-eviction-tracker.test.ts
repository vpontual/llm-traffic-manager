import assert from "node:assert/strict";
import test from "node:test";
import { StuckEvictionTracker } from "../../src/proxy/stuck-eviction-tracker";

// --- recordFailure / recordSuccess ---

test("recordFailure increments per-(server,model) counter", () => {
  const t = new StuckEvictionTracker(5, 1000);
  assert.equal(t.recordFailure(1, "m").count, 1);
  assert.equal(t.recordFailure(1, "m").count, 2);
  assert.equal(t.recordFailure(1, "m").count, 3);
});

test("recordFailure does not alert before threshold", () => {
  const t = new StuckEvictionTracker(5, 1000);
  for (let i = 1; i < 5; i++) {
    assert.equal(t.recordFailure(1, "m").shouldAlert, false);
  }
});

test("recordFailure alerts once at threshold", () => {
  const t = new StuckEvictionTracker(3, 1000);
  assert.equal(t.recordFailure(1, "m").shouldAlert, false);
  assert.equal(t.recordFailure(1, "m").shouldAlert, false);
  assert.equal(t.recordFailure(1, "m").shouldAlert, true);
});

test("recordFailure suppresses repeat alerts within cooldown", () => {
  let now = 1000;
  const t = new StuckEvictionTracker(2, 60_000, () => now);
  t.recordFailure(1, "m");
  assert.equal(t.recordFailure(1, "m").shouldAlert, true); // first alert at 1000
  now = 2000;
  assert.equal(t.recordFailure(1, "m").shouldAlert, false); // 1s later, still in cooldown
  assert.equal(t.recordFailure(1, "m").shouldAlert, false);
});

test("recordFailure re-alerts after cooldown expires", () => {
  let now = 1000;
  const t = new StuckEvictionTracker(2, 60_000, () => now);
  t.recordFailure(1, "m");
  assert.equal(t.recordFailure(1, "m").shouldAlert, true); // first alert at 1000
  now = 1000 + 60_001;
  assert.equal(t.recordFailure(1, "m").shouldAlert, true); // cooldown elapsed
});

test("recordSuccess clears state for that key", () => {
  const t = new StuckEvictionTracker(3, 1000);
  t.recordFailure(1, "m");
  t.recordFailure(1, "m");
  assert.equal(t.failureCount(1, "m"), 2);
  t.recordSuccess(1, "m");
  assert.equal(t.failureCount(1, "m"), 0);
  // Counter restarts from 1 -- previous failures don't bleed in.
  assert.equal(t.recordFailure(1, "m").count, 1);
});

test("recordSuccess clears alert cooldown so next stuck cycle alerts again", () => {
  let now = 1000;
  const t = new StuckEvictionTracker(2, 60_000, () => now);
  t.recordFailure(1, "m");
  t.recordFailure(1, "m"); // alert fires
  t.recordSuccess(1, "m"); // model unloaded successfully
  // New stuck cycle starts; should be allowed to alert again immediately at threshold
  t.recordFailure(1, "m");
  assert.equal(t.recordFailure(1, "m").shouldAlert, true);
});

// --- isolation ---

test("counters are isolated per server", () => {
  const t = new StuckEvictionTracker(5, 1000);
  t.recordFailure(1, "m");
  t.recordFailure(1, "m");
  assert.equal(t.failureCount(1, "m"), 2);
  assert.equal(t.failureCount(2, "m"), 0);
});

test("counters are isolated per model on the same server", () => {
  const t = new StuckEvictionTracker(5, 1000);
  t.recordFailure(1, "alpha");
  t.recordFailure(1, "beta");
  t.recordFailure(1, "beta");
  assert.equal(t.failureCount(1, "alpha"), 1);
  assert.equal(t.failureCount(1, "beta"), 2);
});

test("model names containing colons are tracked correctly", () => {
  const t = new StuckEvictionTracker(5, 1000);
  t.recordFailure(7, "gemma4:26b-a4b");
  t.recordFailure(7, "gemma4:26b-a4b");
  assert.equal(t.failureCount(7, "gemma4:26b-a4b"), 2);
  // A different model on the same server stays isolated
  assert.equal(t.failureCount(7, "qwen3:8b"), 0);
});

// --- resetIfNotLoaded ---

test("resetIfNotLoaded clears state when model no longer loaded", () => {
  const t = new StuckEvictionTracker(5, 1000);
  t.recordFailure(1, "m");
  t.recordFailure(1, "m");
  t.resetIfNotLoaded(1, new Set([])); // m is no longer loaded
  assert.equal(t.failureCount(1, "m"), 0);
});

test("resetIfNotLoaded preserves state when model still loaded", () => {
  const t = new StuckEvictionTracker(5, 1000);
  t.recordFailure(1, "m");
  t.recordFailure(1, "m");
  t.resetIfNotLoaded(1, new Set(["m"]));
  assert.equal(t.failureCount(1, "m"), 2);
});

test("resetIfNotLoaded does not touch other servers' state", () => {
  const t = new StuckEvictionTracker(5, 1000);
  t.recordFailure(1, "m");
  t.recordFailure(2, "m");
  t.resetIfNotLoaded(1, new Set([])); // only server 1 reports model not loaded
  assert.equal(t.failureCount(1, "m"), 0);
  assert.equal(t.failureCount(2, "m"), 1);
});

test("resetIfNotLoaded handles model names with colons", () => {
  const t = new StuckEvictionTracker(5, 1000);
  t.recordFailure(3, "gemma4:26b-a4b");
  t.resetIfNotLoaded(3, new Set([])); // model gone
  assert.equal(t.failureCount(3, "gemma4:26b-a4b"), 0);
});

test("resetIfNotLoaded clears alert cooldown so post-reset failures can alert", () => {
  let now = 1000;
  const t = new StuckEvictionTracker(2, 60_000, () => now);
  t.recordFailure(1, "m");
  t.recordFailure(1, "m"); // alert fires, lastAlertedAt = 1000
  t.resetIfNotLoaded(1, new Set([])); // model unloaded externally
  // New stuck cycle a moment later -- should be free to alert again at threshold
  now = 1500;
  t.recordFailure(1, "m");
  assert.equal(t.recordFailure(1, "m").shouldAlert, true);
});
