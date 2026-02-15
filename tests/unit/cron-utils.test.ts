import assert from "node:assert/strict";
import test from "node:test";
import {
  detectConflicts,
  findOpenSlots,
  getNextExecutions,
  isValidCron,
  rangesOverlap,
  withinConflictWindow,
} from "../../src/lib/cron-utils";

test("getNextExecutions returns requested count and durations", () => {
  const startFrom = new Date("2025-01-01T00:00:00.000Z");
  const executions = getNextExecutions("*/5 * * * *", 3, 60_000, "UTC", startFrom);

  assert.equal(executions.length, 3);
  assert.equal(executions[0].end.getTime() - executions[0].start.getTime(), 60_000);
  assert.ok(executions[1].start.getTime() > executions[0].start.getTime());
  assert.ok(executions[2].start.getTime() > executions[1].start.getTime());
});

test("rangesOverlap treats touching windows as non-overlap", () => {
  const a = {
    start: new Date("2025-01-01T00:00:00.000Z"),
    end: new Date("2025-01-01T00:10:00.000Z"),
  };
  const b = {
    start: new Date("2025-01-01T00:10:00.000Z"),
    end: new Date("2025-01-01T00:20:00.000Z"),
  };
  const c = {
    start: new Date("2025-01-01T00:09:00.000Z"),
    end: new Date("2025-01-01T00:15:00.000Z"),
  };

  assert.equal(rangesOverlap(a, b), false);
  assert.equal(rangesOverlap(a, c), true);
});

test("withinConflictWindow is strict at 5-minute boundary", () => {
  const a = {
    start: new Date("2025-01-01T00:00:00.000Z"),
    end: new Date("2025-01-01T00:01:00.000Z"),
  };
  const b = {
    start: new Date("2025-01-01T00:04:59.999Z"),
    end: new Date("2025-01-01T00:05:59.999Z"),
  };
  const c = {
    start: new Date("2025-01-01T00:05:00.000Z"),
    end: new Date("2025-01-01T00:06:00.000Z"),
  };

  assert.equal(withinConflictWindow(a, b), true);
  assert.equal(withinConflictWindow(a, c), false);
});

test("isValidCron accepts valid expressions and rejects invalid", () => {
  assert.equal(isValidCron("*/15 * * * *"), true);
  assert.equal(isValidCron("not-a-cron"), false);
});

test("detectConflicts finds same-model overlap conflicts", () => {
  const jobs = [
    {
      id: 1,
      name: "job-a",
      cronExpression: "*/15 * * * *",
      timezone: "UTC",
      targetModel: "llama3",
      expectedDurationMs: 10 * 60_000,
    },
    {
      id: 2,
      name: "job-b",
      cronExpression: "*/15 * * * *",
      timezone: "UTC",
      targetModel: "llama3",
      expectedDurationMs: 10 * 60_000,
    },
  ];

  const conflicts = detectConflicts(jobs, 2);
  assert.ok(conflicts.some((c) => c.conflictType === "same_model"));
});

test("detectConflicts finds time overlap for different models", () => {
  const jobs = [
    {
      id: 1,
      name: "job-a",
      cronExpression: "*/20 * * * *",
      timezone: "UTC",
      targetModel: "llama3",
      expectedDurationMs: 60_000,
    },
    {
      id: 2,
      name: "job-b",
      cronExpression: "*/20 * * * *",
      timezone: "UTC",
      targetModel: "qwen2",
      expectedDurationMs: 60_000,
    },
  ];

  const conflicts = detectConflicts(jobs, 2);
  assert.ok(conflicts.some((c) => c.conflictType === "time_overlap"));
});

test("findOpenSlots returns candidate slots and caps at 10", () => {
  const slots = findOpenSlots([], "llama3", 60_000, 24);
  assert.ok(slots.length > 0);
  assert.ok(slots.length <= 10);
});

test("findOpenSlots can return zero when schedule is fully occupied", () => {
  const slots = findOpenSlots(
    [
      {
        id: 1,
        name: "busy",
        cronExpression: "* * * * *",
        timezone: "UTC",
        targetModel: "llama3",
        expectedDurationMs: 60 * 60_000,
      },
    ],
    "llama3",
    30 * 60_000,
    1,
    30
  );

  assert.equal(slots.length, 0);
});
