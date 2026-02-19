import assert from "node:assert/strict";
import test from "node:test";
import {
  validatePullInput,
  validateDeleteInput,
} from "../../src/lib/validations/model-management";

test("validatePullInput accepts valid input", () => {
  const result = validatePullInput({ modelName: "llama3:8b", serverId: 1 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.modelName, "llama3:8b");
    assert.equal(result.data.serverId, 1);
  }
});

test("validatePullInput rejects missing modelName", () => {
  const result = validatePullInput({ serverId: 1 });
  assert.equal(result.ok, false);
});

test("validatePullInput rejects missing serverId", () => {
  const result = validatePullInput({ modelName: "llama3" });
  assert.equal(result.ok, false);
});

test("validatePullInput rejects non-integer serverId", () => {
  const result = validatePullInput({ modelName: "llama3", serverId: "abc" });
  assert.equal(result.ok, false);
});

test("validateDeleteInput accepts valid input", () => {
  const result = validateDeleteInput({ modelName: "llama3:8b", serverId: 2 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.modelName, "llama3:8b");
    assert.equal(result.data.serverId, 2);
    assert.equal(result.data.acknowledgeCustom, false);
  }
});

test("validateDeleteInput accepts acknowledgeCustom flag", () => {
  const result = validateDeleteInput({
    modelName: "custom-model",
    serverId: 1,
    acknowledgeCustom: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.acknowledgeCustom, true);
  }
});

test("validateDeleteInput rejects missing fields", () => {
  const result = validateDeleteInput({});
  assert.equal(result.ok, false);
});

test("validateDeleteInput rejects invalid types", () => {
  const result = validateDeleteInput({
    modelName: 123,
    serverId: "not-a-number",
  });
  assert.equal(result.ok, false);
});
