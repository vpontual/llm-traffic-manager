// Per-user Telegram notifications for server events (offline, online, reboot)

import { db } from "./db";
import { userTelegramConfigs, userServerSubscriptions, users } from "./schema";
import { eq, and } from "drizzle-orm";

interface ServerEventNotification {
  serverId: number;
  serverName: string;
  eventType: "offline" | "online" | "reboot";
  detail: string | null;
}

export async function notifySubscribedUsers(event: ServerEventNotification): Promise<void> {
  try {
    // Build the filter for the relevant notify boolean
    const notifyColumn =
      event.eventType === "offline"
        ? userServerSubscriptions.notifyOffline
        : event.eventType === "online"
          ? userServerSubscriptions.notifyOnline
          : userServerSubscriptions.notifyReboot;

    const subscribers = await db
      .select({
        botToken: userTelegramConfigs.botToken,
        chatId: userTelegramConfigs.chatId,
        username: users.username,
      })
      .from(userServerSubscriptions)
      .innerJoin(
        userTelegramConfigs,
        and(
          eq(userServerSubscriptions.userId, userTelegramConfigs.userId),
          eq(userTelegramConfigs.isEnabled, true)
        )
      )
      .innerJoin(users, eq(userServerSubscriptions.userId, users.id))
      .where(
        and(
          eq(userServerSubscriptions.serverId, event.serverId),
          eq(notifyColumn, true)
        )
      );

    if (subscribers.length === 0) return;

    const message = formatEventMessage(event);

    await Promise.allSettled(
      subscribers.map((sub) => sendUserTelegram(sub.botToken, sub.chatId, message))
    );

    console.log(
      `[UserNotify] ${event.serverName} ${event.eventType}: notified ${subscribers.length} user(s)`
    );
  } catch (err) {
    console.error("[UserNotify] Error:", err);
  }
}

async function sendUserTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error("[UserNotify] Telegram send failed for chat " + chatId + ": " + res.status);
  }
}

function formatEventMessage(event: ServerEventNotification): string {
  switch (event.eventType) {
    case "offline":
      return "<b>\u26a0\ufe0f Server Offline</b>\n\n<b>" + event.serverName + "</b> is not responding.";
    case "online":
      return "<b>\u2705 Server Online</b>\n\n<b>" + event.serverName + "</b> is back online.";
    case "reboot":
      return "<b>\ud83d\udd04 Server Rebooted</b>\n\n<b>" + event.serverName + "</b> rebooted." +
        (event.detail ? "\n" + event.detail : "");
  }
}
