import { invalid, valid, ValidationResult } from "./common";
import { z } from "zod";

export interface UserUpdateInput {
  password?: string;
  isAdmin?: boolean;
}

const userUpdateSchema = z
  .object({
    password: z.string().min(4).optional(),
    isAdmin: z.boolean().optional(),
  })
  .passthrough();

export function validateUserUpdateInput(
  body: unknown
): ValidationResult<UserUpdateInput> {
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return invalid("Invalid user update payload");
  }

  return valid({
    password: parsed.data.password,
    isAdmin: parsed.data.isAdmin,
  });
}
