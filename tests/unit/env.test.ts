import assert from "node:assert/strict";
import test from "node:test";
import {
  requireEnv,
  readJsonEnv,
  readPositiveIntEnv,
  isProduction,
} from "../../src/lib/env";

test("requireEnv returns value when env var is set", () => {
  process.env.TEST_REQUIRE_ENV = "hello";
  assert.equal(requireEnv("TEST_REQUIRE_ENV"), "hello");
  delete process.env.TEST_REQUIRE_ENV;
});

test("requireEnv trims whitespace", () => {
  process.env.TEST_TRIM = "  value  ";
  assert.equal(requireEnv("TEST_TRIM"), "value");
  delete process.env.TEST_TRIM;
});

test("requireEnv throws when env var is missing", () => {
  delete process.env.TEST_MISSING_VAR;
  assert.throws(() => requireEnv("TEST_MISSING_VAR"), /is required/);
});

test("requireEnv throws for whitespace-only value", () => {
  process.env.TEST_EMPTY = "   ";
  assert.throws(() => requireEnv("TEST_EMPTY"), /is required/);
  delete process.env.TEST_EMPTY;
});

test("readJsonEnv parses valid JSON", () => {
  process.env.TEST_JSON = '{"key": "value", "count": 3}';
  const result = readJsonEnv<{ key: string; count: number }>("TEST_JSON");
  assert.deepEqual(result, { key: "value", count: 3 });
  delete process.env.TEST_JSON;
});

test("readJsonEnv returns null for unset var", () => {
  delete process.env.TEST_JSON_MISSING;
  assert.equal(readJsonEnv("TEST_JSON_MISSING"), null);
});

test("readJsonEnv throws for invalid JSON", () => {
  process.env.TEST_BAD_JSON = "not-json{";
  assert.throws(() => readJsonEnv("TEST_BAD_JSON"), /must be valid JSON/);
  delete process.env.TEST_BAD_JSON;
});

test("readPositiveIntEnv returns parsed integer", () => {
  process.env.TEST_INT = "42";
  assert.equal(readPositiveIntEnv("TEST_INT", 10), 42);
  delete process.env.TEST_INT;
});

test("readPositiveIntEnv returns fallback for missing var", () => {
  delete process.env.TEST_INT_MISSING;
  assert.equal(readPositiveIntEnv("TEST_INT_MISSING", 10), 10);
});

test("readPositiveIntEnv throws for non-numeric value", () => {
  process.env.TEST_INT_BAD = "abc";
  assert.throws(() => readPositiveIntEnv("TEST_INT_BAD", 10), /must be a positive integer/);
  delete process.env.TEST_INT_BAD;
});

test("readPositiveIntEnv throws for negative value", () => {
  process.env.TEST_INT_NEG = "-5";
  assert.throws(() => readPositiveIntEnv("TEST_INT_NEG", 10), /must be a positive integer/);
  delete process.env.TEST_INT_NEG;
});

test("isProduction checks NODE_ENV", () => {
  const original = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  assert.equal(isProduction(), true);
  (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  assert.equal(isProduction(), false);
  (process.env as Record<string, string | undefined>).NODE_ENV = original;
});
