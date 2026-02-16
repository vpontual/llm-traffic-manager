import assert from "node:assert/strict";
import test from "node:test";
import { formatUptime, formatBytes, timeAgo } from "../../src/lib/format";

// --- formatUptime ---

test("formatUptime returns minutes for short durations", () => {
  assert.equal(formatUptime(0), "0m");
  assert.equal(formatUptime(59), "0m");
  assert.equal(formatUptime(60), "1m");
  assert.equal(formatUptime(300), "5m");
  assert.equal(formatUptime(3540), "59m");
});

test("formatUptime returns hours and minutes", () => {
  assert.equal(formatUptime(3600), "1h 0m");
  assert.equal(formatUptime(3660), "1h 1m");
  assert.equal(formatUptime(7200), "2h 0m");
  assert.equal(formatUptime(5400), "1h 30m");
});

test("formatUptime returns days and hours", () => {
  assert.equal(formatUptime(86400), "1d 0h");
  assert.equal(formatUptime(90000), "1d 1h");
  assert.equal(formatUptime(172800), "2d 0h");
  assert.equal(formatUptime(259200), "3d 0h");
});

test("formatUptime handles large values", () => {
  const thirtyDays = 30 * 86400;
  assert.equal(formatUptime(thirtyDays), "30d 0h");
});

// --- formatBytes ---

test("formatBytes returns 0 B for zero", () => {
  assert.equal(formatBytes(0), "0 B");
});

test("formatBytes returns MB for sub-GB values", () => {
  const oneMB = 1024 * 1024;
  assert.equal(formatBytes(oneMB), "1 MB");
  assert.equal(formatBytes(512 * 1024 * 1024), "512 MB");
  assert.equal(formatBytes(100 * 1024 * 1024), "100 MB");
});

test("formatBytes returns GB for large values", () => {
  const oneGB = 1024 * 1024 * 1024;
  assert.equal(formatBytes(oneGB), "1.0 GB");
  assert.equal(formatBytes(4.2 * oneGB), "4.2 GB");
  assert.equal(formatBytes(128 * oneGB), "128.0 GB");
});

test("formatBytes handles boundary at 1 GB", () => {
  const justUnder = 1024 * 1024 * 1024 - 1;
  const exactlyOne = 1024 * 1024 * 1024;
  assert.match(formatBytes(justUnder), /MB$/);
  assert.match(formatBytes(exactlyOne), /GB$/);
});

// --- timeAgo ---

test("timeAgo returns 'just now' for recent timestamps", () => {
  const now = new Date().toISOString();
  assert.equal(timeAgo(now), "just now");
});

test("timeAgo returns minutes for sub-hour durations", () => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
  assert.equal(timeAgo(fiveMinAgo), "5m ago");
});

test("timeAgo returns hours for sub-day durations", () => {
  const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
  assert.equal(timeAgo(threeHoursAgo), "3h ago");
});

test("timeAgo returns days for multi-day durations", () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  assert.equal(timeAgo(twoDaysAgo), "2d ago");
});

test("timeAgo returns 1m ago at exactly 60 seconds", () => {
  const oneMinAgo = new Date(Date.now() - 60000).toISOString();
  assert.equal(timeAgo(oneMinAgo), "1m ago");
});
