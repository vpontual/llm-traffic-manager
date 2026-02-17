import { isValidCron } from "../cron-utils";
import {
  invalid,
  valid,
  ValidationResult,
} from "./common";
import { parsePositiveInt } from "./numbers";
import { z } from "zod";

const CREATE_REQUIRED_FIELDS_ERROR =
  "Missing required fields: name, sourceIdentifier, cronExpression, targetModel";

export interface CreateScheduledJobInput {
  name: string;
  description: string | null;
  sourceIdentifier: string;
  cronExpression: string;
  timezone: string;
  targetModel: string;
  preferredServerId: number | null;
  expectedDurationMs: number;
}

export interface ScheduledJobSuggestionsInput {
  model: string;
  durationMs: number;
  hours: number;
}

const createScheduledJobSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  sourceIdentifier: z.string().trim().min(1),
  cronExpression: z.string().trim().min(1),
  timezone: z.string().trim().optional(),
  targetModel: z.string().trim().min(1),
  preferredServerId: z.union([z.number(), z.string()]).optional().nullable(),
  expectedDurationMs: z.union([z.number(), z.string()]).optional(),
});

const scheduledJobUpdatesSchema = z
  .object({
    name: z.unknown().optional(),
    description: z.unknown().optional(),
    sourceIdentifier: z.unknown().optional(),
    cronExpression: z.unknown().optional(),
    timezone: z.unknown().optional(),
    targetModel: z.unknown().optional(),
    preferredServerId: z.unknown().optional(),
    expectedDurationMs: z.unknown().optional(),
    isEnabled: z.unknown().optional(),
  })
  .passthrough();

const suggestionsSchema = z.object({
  model: z.string().trim().min(1),
  durationMs: z.string().optional().nullable(),
  hours: z.string().optional().nullable(),
});

function parseOptionalPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parsePreferredServerId(value: unknown): number | null {
  return parseOptionalPositiveInteger(value);
}

function parseExpectedDurationMs(value: unknown): number {
  return parseOptionalPositiveInteger(value) ?? 60000;
}

export function validateCreateScheduledJobInput(
  body: unknown
): ValidationResult<CreateScheduledJobInput> {
  const parsed = createScheduledJobSchema.safeParse(body);
  if (!parsed.success) {
    return invalid(CREATE_REQUIRED_FIELDS_ERROR);
  }

  const {
    name,
    sourceIdentifier,
    cronExpression,
    targetModel,
  } = parsed.data;

  if (!isValidCron(cronExpression)) {
    return invalid("Invalid cron expression");
  }

  const timezone = parsed.data.timezone && parsed.data.timezone.length > 0
    ? parsed.data.timezone
    : "UTC";
  const description = parsed.data.description?.trim() || null;

  return valid({
    name,
    description,
    sourceIdentifier,
    cronExpression,
    timezone,
    targetModel,
    preferredServerId: parsePreferredServerId(parsed.data.preferredServerId),
    expectedDurationMs: parseExpectedDurationMs(parsed.data.expectedDurationMs),
  });
}

export function validateScheduledJobUpdates(
  body: unknown
): ValidationResult<Record<string, unknown>> {
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  const parsed = scheduledJobUpdatesSchema.safeParse(body);
  if (!parsed.success) {
    return valid(updates);
  }

  const payload = parsed.data;
  const cronExpression = payload.cronExpression;
  if (
    cronExpression !== undefined &&
    typeof cronExpression === "string" &&
    !isValidCron(cronExpression)
  ) {
    return invalid("Invalid cron expression");
  }

  const fields: Array<keyof typeof payload> = [
    "name",
    "description",
    "sourceIdentifier",
    "cronExpression",
    "timezone",
    "targetModel",
    "preferredServerId",
    "expectedDurationMs",
    "isEnabled",
  ];

  for (const field of fields) {
    if (payload[field] !== undefined) {
      updates[field] = payload[field];
    }
  }

  return valid(updates);
}

export function validateScheduledJobSuggestionsInput(
  searchParams: URLSearchParams
): ValidationResult<ScheduledJobSuggestionsInput> {
  const parsed = suggestionsSchema.safeParse({
    model: searchParams.get("model") ?? "",
    durationMs: searchParams.get("durationMs"),
    hours: searchParams.get("hours"),
  });
  if (!parsed.success) {
    return invalid("Missing required parameter: model");
  }

  const durationMs = parsePositiveInt(parsed.data.durationMs ?? null, 60000);
  const hours = Math.min(parsePositiveInt(parsed.data.hours ?? null, 24), 168);

  return valid({
    model: parsed.data.model,
    durationMs,
    hours,
  });
}
