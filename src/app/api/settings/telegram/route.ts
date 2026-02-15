import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userTelegramConfigs } from "@/lib/schema";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [config] = await db
    .select()
    .from(userTelegramConfigs)
    .where(eq(userTelegramConfigs.userId, user.id))
    .limit(1);

  return NextResponse.json(config ?? null);
}

export async function PUT(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { botToken, chatId, isEnabled } = await request.json();

  if (!botToken || !chatId) {
    return NextResponse.json({ error: "Bot token and chat ID required" }, { status: 400 });
  }

  // Validate bot token by calling getMe
  try {
    const res = await fetch("https://api.telegram.org/bot" + botToken + "/getMe");
    if (!res.ok) {
      return NextResponse.json({ error: "Invalid bot token" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to validate bot token" }, { status: 400 });
  }

  // Upsert config
  const [existing] = await db
    .select({ id: userTelegramConfigs.id })
    .from(userTelegramConfigs)
    .where(eq(userTelegramConfigs.userId, user.id))
    .limit(1);

  if (existing) {
    await db
      .update(userTelegramConfigs)
      .set({ botToken, chatId, isEnabled: isEnabled ?? true })
      .where(eq(userTelegramConfigs.userId, user.id));
  } else {
    await db.insert(userTelegramConfigs).values({
      userId: user.id,
      botToken,
      chatId,
      isEnabled: isEnabled ?? true,
    });
  }

  // Send test message
  try {
    await fetch("https://api.telegram.org/bot" + botToken + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Ollama Fleet Manager: Telegram notifications configured successfully!",
      }),
    });
  } catch {
    // Non-fatal — config is saved regardless
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.delete(userTelegramConfigs).where(eq(userTelegramConfigs.userId, user.id));
  return NextResponse.json({ ok: true });
}
