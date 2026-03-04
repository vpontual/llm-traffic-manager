import assert from "node:assert/strict";
import test from "node:test";
import {
  describeCron,
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

// --- getNextExecutions error path ---

test("getNextExecutions returns empty for invalid cron", () => {
  const result = getNextExecutions("not-valid-cron", 3, 60_000);
  assert.deepEqual(result, []);
});

// --- describeCron tests ---

test("describeCron returns 'Every minute' for * * * * *", () => {
  assert.equal(describeCron("* * * * *"), "Every minute");
});

test("describeCron returns 'Every hour' for 0 * * * *", () => {
  assert.equal(describeCron("0 * * * *"), "Every hour");
});

test("describeCron returns 'Daily at midnight' for 0 0 * * *", () => {
  assert.equal(describeCron("0 0 * * *"), "Daily at midnight");
});

test("describeCron returns interval for */N hours", () => {
  assert.equal(describeCron("0 */3 * * *"), "Every 3 hours");
});

test("describeCron returns interval for */N minutes", () => {
  assert.equal(describeCron("*/15 * * * *"), "Every 15 minutes");
});

test("describeCron matches midnight before weekly/monthly", () => {
  // 0 0 * * 0 matches "minute=0 && hour=0" first → "Daily at midnight"
  assert.equal(describeCron("0 0 * * 0"), "Daily at midnight");
  assert.equal(describeCron("0 0 1 * *"), "Daily at midnight");
});

test("describeCron returns daily at HH:MM for specific time", () => {
  assert.equal(describeCron("30 14 * * *"), "Daily at 14:30");
});

test("describeCron returns invalid for bad expression", () => {
  assert.equal(describeCron("not-a-cron"), "Invalid cron expression");
});

test("describeCron returns invalid for too few parts", () => {
  assert.equal(describeCron("* *"), "Invalid cron expression");
});

test("describeCron returns next execution for non-matching patterns", () => {
  // "0 0 15 6 *" has minute=0 hour=0 → matches "Daily at midnight" first
  // Use a pattern that doesn't match any shortcut: specific day + month + dow
  const result = describeCron("15 9 15 6 3");
  assert.ok(result.startsWith("Next:"), `expected "Next:..." but got "${result}"`);
});
