import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword, generateApiKey } from "../../src/lib/crypto";

test("hashPassword produces a bcrypt hash", async () => {
  const hash = await hashPassword("test-password");
  assert.ok(hash.startsWith("$2"));
  assert.ok(hash.length > 50);
});

test("hashPassword produces different hashes for same input (salt)", async () => {
  const hash1 = await hashPassword("same-password");
  const hash2 = await hashPassword("same-password");
  assert.notEqual(hash1, hash2);
});

test("verifyPassword returns true for correct password", async () => {
  const hash = await hashPassword("correct-password");
  const result = await verifyPassword("correct-password", hash);
  assert.equal(result, true);
});

test("verifyPassword returns false for wrong password", async () => {
  const hash = await hashPassword("correct-password");
  const result = await verifyPassword("wrong-password", hash);
  assert.equal(result, false);
});

test("generateApiKey returns 64-char hex string", () => {
  const key = generateApiKey();
  assert.equal(key.length, 64);
  assert.match(key, /^[0-9a-f]{64}$/);
});

test("generateApiKey produces unique keys", () => {
  const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
  assert.equal(keys.size, 10);
});
