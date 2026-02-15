import {
  invalid,
  valid,
  ValidationResult,
} from "./common";
import { z } from "zod";

export interface TelegramConfigInput {
  botToken: string;
  chatId: string;
  isEnabled: boolean;
}

const telegramConfigSchema = z.object({
  botToken: z.string().trim().min(1),
  chatId: z.string().trim().min(1),
  isEnabled: z.boolean().optional(),
});

export function validateTelegramConfigInput(
  body: unknown
): ValidationResult<TelegramConfigInput> {
  const parsed = telegramConfigSchema.safeParse(body);
  if (!parsed.success) {
    return invalid("Bot token and chat ID required");
  }

  return valid({
    botToken: parsed.data.botToken,
    chatId: parsed.data.chatId,
    isEnabled: parsed.data.isEnabled ?? true,
  });
}
