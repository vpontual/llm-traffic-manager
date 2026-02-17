import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLoginInput,
  validateNewUserInput,
  validateSetupInput,
} from "../../src/lib/validations/auth";
import { validateTelegramConfigInput } from "../../src/lib/validations/telegram";
import {
  validateCreateScheduledJobInput,
  validateScheduledJobSuggestionsInput,
  validateScheduledJobUpdates,
} from "../../src/lib/validations/scheduled-jobs";
import {
  parsePositiveInt,
  validateNumericId,
  validatePositiveInt,
} from "../../src/lib/validations/numbers";
import { validateSystemMetricsServerId } from "../../src/lib/validations/system-metrics";
import { validateSubscriptionsInput } from "../../src/lib/validations/subscriptions";
import { validateUserUpdateInput } from "../../src/lib/validations/users";

test("validateLoginInput normalizes username", () => {
  const result = validateLoginInput({
    username: "  Admin ",
    password: "secret",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.username, "admin");
    assert.equal(result.data.password, "secret");
  }
});

test("validateSetupInput enforces password min length", () => {
  const result = validateSetupInput({
    username: "admin",
    password: "123",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /at least 10 characters/);
  }
});

test("validateNewUserInput defaults isAdmin to false", () => {
  const result = validateNewUserInput({
    username: "new-user",
    password: "averystrongpassword",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.isAdmin, false);
  }
});

test("validateTelegramConfigInput requires bot token and chat id", () => {
  const result = validateTelegramConfigInput({
    botToken: "",
    chatId: "123",
  });

  assert.equal(result.ok, false);
});

test("validateCreateScheduledJobInput validates required fields and cron", () => {
  const missing = validateCreateScheduledJobInput({
    name: "job",
    sourceIdentifier: "source",
  });
  assert.equal(missing.ok, false);

  const invalidCron = validateCreateScheduledJobInput({
    name: "job",
    sourceIdentifier: "source",
    cronExpression: "not-a-cron",
    targetModel: "llama3",
  });
  assert.equal(invalidCron.ok, false);

  const valid = validateCreateScheduledJobInput({
    name: "job",
    description: "",
    sourceIdentifier: "source",
    cronExpression: "*/5 * * * *",
    targetModel: "llama3",
    expectedDurationMs: "90000",
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.data.description, null);
    assert.equal(valid.data.timezone, "UTC");
    assert.equal(valid.data.expectedDurationMs, 90000);
  }
});

test("validateScheduledJobUpdates rejects invalid cron expression", () => {
  const result = validateScheduledJobUpdates({
    cronExpression: "bad-cron",
  });
  assert.equal(result.ok, false);
});

test("validateScheduledJobSuggestionsInput requires model", () => {
  const params = new URLSearchParams("hours=12");
  const result = validateScheduledJobSuggestionsInput(params);
  assert.equal(result.ok, false);
});

test("numeric validators parse and validate values", () => {
  assert.equal(parsePositiveInt("15", 24), 15);
  assert.equal(parsePositiveInt("-1", 24), 24);

  const validId = validateNumericId("42", "job ID");
  assert.equal(validId.ok, true);

  const invalidId = validateNumericId("abc", "job ID");
  assert.equal(invalidId.ok, false);

  const positive = validatePositiveInt("3", "must be positive");
  assert.equal(positive.ok, true);
});

test("validateSystemMetricsServerId requires a positive serverId", () => {
  const invalid = validateSystemMetricsServerId(new URLSearchParams());
  assert.equal(invalid.ok, false);

  const valid = validateSystemMetricsServerId(new URLSearchParams("serverId=2"));
  assert.equal(valid.ok, true);
});

test("validateUserUpdateInput validates payload shape", () => {
  const invalid = validateUserUpdateInput({
    password: "123",
  });
  assert.equal(invalid.ok, false);

  const valid = validateUserUpdateInput({
    password: "1234567890",
    isAdmin: true,
  });
  assert.equal(valid.ok, true);
});

test("validateSubscriptionsInput validates subscription array payload", () => {
  const valid = validateSubscriptionsInput([
    {
      serverId: 1,
      notifyOffline: true,
      notifyOnline: false,
      notifyReboot: true,
    },
  ]);
  assert.equal(valid.ok, true);

  const invalid = validateSubscriptionsInput([
    {
      serverId: "1",
      notifyOffline: true,
      notifyOnline: false,
      notifyReboot: true,
    },
  ]);
  assert.equal(invalid.ok, false);
});
