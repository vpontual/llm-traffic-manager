import { invalid, valid, ValidationResult } from "./common";
import { z } from "zod";

export interface ModelPullInput {
  modelName: string;
  serverId: number;
}

export interface ModelDeleteInput {
  modelName: string;
  serverId: number;
  acknowledgeCustom: boolean;
}

const pullSchema = z.object({
  modelName: z.string().trim().min(1),
  serverId: z.number().int().positive(),
});

const deleteSchema = z.object({
  modelName: z.string().trim().min(1),
  serverId: z.number().int().positive(),
  acknowledgeCustom: z.boolean().optional(),
});

export function validatePullInput(
  body: unknown
): ValidationResult<ModelPullInput> {
  const parsed = pullSchema.safeParse(body);
  if (!parsed.success) {
    return invalid("modelName (string) and serverId (positive integer) required");
  }
  return valid({
    modelName: parsed.data.modelName,
    serverId: parsed.data.serverId,
  });
}

export function validateDeleteInput(
  body: unknown
): ValidationResult<ModelDeleteInput> {
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return invalid(
      "modelName (string) and serverId (positive integer) required"
    );
  }
  return valid({
    modelName: parsed.data.modelName,
    serverId: parsed.data.serverId,
    acknowledgeCustom: parsed.data.acknowledgeCustom ?? false,
  });
}
