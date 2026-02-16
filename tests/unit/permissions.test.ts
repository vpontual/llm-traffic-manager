import assert from "node:assert/strict";
import test from "node:test";
import { isSelfOrAdmin } from "../../src/lib/permissions";

test("isSelfOrAdmin returns true for admin user", () => {
  const user = { id: 1, isAdmin: true };
  assert.equal(isSelfOrAdmin(user, 99), true);
});

test("isSelfOrAdmin returns true when user targets self", () => {
  const user = { id: 5, isAdmin: false };
  assert.equal(isSelfOrAdmin(user, 5), true);
});

test("isSelfOrAdmin returns false for non-admin targeting other user", () => {
  const user = { id: 5, isAdmin: false };
  assert.equal(isSelfOrAdmin(user, 10), false);
});

test("isSelfOrAdmin returns true for admin targeting self", () => {
  const user = { id: 1, isAdmin: true };
  assert.equal(isSelfOrAdmin(user, 1), true);
});
