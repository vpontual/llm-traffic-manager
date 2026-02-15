import { invalid, valid, ValidationResult } from "./common";
import { z } from "zod";

const positiveIntegerFromString = z
  .string()
  .transform((value) => Number.parseInt(value, 10))
  .pipe(z.number().int().positive());

const integerFromString = z
  .string()
  .transform((value) => Number.parseInt(value, 10))
  .refine((value) => !Number.isNaN(value), {
    message: "Invalid integer",
  });

export function parsePositiveInt(
  rawValue: string | null,
  defaultValue: number
): number {
  const parsed = positiveIntegerFromString.safeParse(rawValue ?? "");
  if (!parsed.success) {
    return defaultValue;
  }

  return parsed.data;
}

export function validatePositiveInt(
  rawValue: string | null,
  error: string
): ValidationResult<number> {
  const parsed = positiveIntegerFromString.safeParse(rawValue ?? "");
  if (!parsed.success) {
    return invalid(error);
  }

  return valid(parsed.data);
}

export function validateNumericId(
  rawValue: string,
  label: string
): ValidationResult<number> {
  const parsed = integerFromString.safeParse(rawValue);
  if (!parsed.success) {
    return invalid(`Invalid ${label}`);
  }

  return valid(parsed.data);
}
