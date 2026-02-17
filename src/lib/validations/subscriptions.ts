import { z } from "zod";
import { invalid, valid, type ValidationResult } from "./common";

export interface SubscriptionInput {
  serverId: number;
  notifyOffline: boolean;
  notifyOnline: boolean;
  notifyReboot: boolean;
}

const subscriptionSchema = z.object({
  serverId: z.number().int().positive(),
  notifyOffline: z.boolean(),
  notifyOnline: z.boolean(),
  notifyReboot: z.boolean(),
});

const subscriptionsSchema = z.array(subscriptionSchema);

export function validateSubscriptionsInput(
  body: unknown
): ValidationResult<SubscriptionInput[]> {
  const parsed = subscriptionsSchema.safeParse(body);
  if (!parsed.success) {
    return invalid("Invalid subscriptions payload");
  }
  return valid(parsed.data);
}
