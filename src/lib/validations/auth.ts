import {
  invalid,
  valid,
  ValidationResult,
} from "./common";
import { z } from "zod";

const MIN_PASSWORD_LENGTH = 4;

export const USERNAME_PASSWORD_MIN_LENGTH_ERROR =
  "Username required, password must be at least 4 characters";

export interface CredentialsInput {
  username: string;
  password: string;
}

export interface NewUserInput extends CredentialsInput {
  isAdmin: boolean;
}

function normalizeUsername(username: string): string {
  return username.toLowerCase();
}

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const setupSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(MIN_PASSWORD_LENGTH),
});

const newUserSchema = setupSchema.extend({
  isAdmin: z.boolean().optional(),
});

export function validateLoginInput(
  body: unknown
): ValidationResult<CredentialsInput> {
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return invalid("Missing credentials");
  }

  return valid({
    username: normalizeUsername(parsed.data.username),
    password: parsed.data.password,
  });
}

export function validateSetupInput(
  body: unknown
): ValidationResult<CredentialsInput> {
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return invalid(USERNAME_PASSWORD_MIN_LENGTH_ERROR);
  }

  return valid({
    username: normalizeUsername(parsed.data.username),
    password: parsed.data.password,
  });
}

export function validateNewUserInput(
  body: unknown
): ValidationResult<NewUserInput> {
  const parsed = newUserSchema.safeParse(body);
  if (!parsed.success) {
    return invalid(USERNAME_PASSWORD_MIN_LENGTH_ERROR);
  }

  return valid({
    username: normalizeUsername(parsed.data.username),
    password: parsed.data.password,
    isAdmin: parsed.data.isAdmin ?? false,
  });
}
