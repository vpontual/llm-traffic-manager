import assert from "node:assert/strict";
import test from "node:test";
import { getHoursParam, getHoursWindow } from "../../src/lib/api/time-window";

function params(hours?: string): URLSearchParams {
  const sp = new URLSearchParams();
  if (hours !== undefined) sp.set("hours", hours);
  return sp;
}

// --- getHoursParam ---

test("getHoursParam returns parsed value", () => {
  assert.equal(getHoursParam(params("48"), 24), 48);
});

test("getHoursParam returns default when param missing", () => {
  assert.equal(getHoursParam(params(), 24), 24);
});

test("getHoursParam returns default for non-numeric input", () => {
  assert.equal(getHoursParam(params("abc"), 24), 24);
});

test("getHoursParam clamps to maxHours", () => {
  assert.equal(getHoursParam(params("200"), 24, 168), 168);
});

test("getHoursParam allows value under maxHours", () => {
  assert.equal(getHoursParam(params("48"), 24, 168), 48);
});

test("getHoursParam ignores maxHours when undefined", () => {
  assert.equal(getHoursParam(params("500"), 24), 500);
});

// --- getHoursWindow ---

test("getHoursWindow returns correct hours and since date", () => {
  const before = Date.now();
  const result = getHoursWindow(params("24"), 24);
  const after = Date.now();

  assert.equal(result.hours, 24);
  const expectedMs = 24 * 60 * 60 * 1000;
  assert.ok(result.since.getTime() >= before - expectedMs);
  assert.ok(result.since.getTime() <= after - expectedMs);
});

test("getHoursWindow uses default when param missing", () => {
  const result = getHoursWindow(params(), 12);
  assert.equal(result.hours, 12);
});

test("getHoursWindow respects maxHours", () => {
  const result = getHoursWindow(params("999"), 24, 168);
  assert.equal(result.hours, 168);
});
