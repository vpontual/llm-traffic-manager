import { db } from "./db";
import { servers, serverSnapshots, systemMetrics, serverEvents } from "./schema";
import { eq, desc, and } from "drizzle-orm";
import { getTelegramConfig, isTelegramConfigured, sendTelegramReply } from "./telegram";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
}

let lastUpdateId = 0;

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function handleStatus(chatId: number): Promise<void> {
  const allServers = await db.select().from(servers);
  const lines: string[] = ["<b>Fleet Status</b>\n"];

  for (const server of allServers) {
    // Get latest snapshot
    const [snap] = await db
      .select()
      .from(serverSnapshots)
      .where(eq(serverSnapshots.serverId, server.id))
      .orderBy(desc(serverSnapshots.polledAt))
      .limit(1);

    // Get latest metrics
    const [metrics] = await db
      .select()
      .from(systemMetrics)
      .where(eq(systemMetrics.serverId, server.id))
      .orderBy(desc(systemMetrics.polledAt))
      .limit(1);

    if (!snap) {
      lines.push(`\u2753 <b>${server.name}</b> \u2014 no data`);
      continue;
    }

    const icon = snap.isOnline ? "\u2705" : "\u274c";
    const uptime = metrics?.uptimeSeconds
      ? formatUptime(metrics.uptimeSeconds)
      : "?";

    // Count loaded models
    const models = (snap.loadedModels as Array<{ name: string }>) ?? [];
    const modelInfo =
      models.length > 0
        ? models.map((m) => m.name).join(", ")
        : "no models loaded";

    if (snap.isOnline) {
      lines.push(`${icon} <b>${server.name}</b> \u2014 online (${uptime}) \u2014 ${modelInfo}`);
    } else {
      lines.push(`${icon} <b>${server.name}</b> \u2014 offline`);
    }
  }

  await sendTelegramReply(chatId, lines.join("\n"));
}

async function handleLastReboot(chatId: number): Promise<void> {
  const allServers = await db.select().from(servers);
  const lines: string[] = ["<b>Recent Reboots</b>\n"];

  for (const server of allServers) {
    // Get latest reboot event
    const [reboot] = await db
      .select()
      .from(serverEvents)
      .where(
        and(
          eq(serverEvents.serverId, server.id),
          eq(serverEvents.eventType, "reboot")
        )
      )
      .orderBy(desc(serverEvents.occurredAt))
      .limit(1);

    if (!reboot) {
      lines.push(`<b>${server.name}</b> \u2014 no reboots recorded`);
      continue;
    }

    const ago = timeAgo(reboot.occurredAt.toISOString());
    const detail = reboot.detail ?? "unknown cause";
    lines.push(`<b>${server.name}</b> \u2014 ${ago} \u2014 ${detail}`);
  }

  await sendTelegramReply(chatId, lines.join("\n"));
}

async function processUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;

  const { chatId } = getTelegramConfig();
  // Only respond to the configured chat
  if (String(msg.chat.id) !== chatId) return;

  const text = msg.text.trim().toLowerCase();

  if (text === "/status") {
    await handleStatus(msg.chat.id);
  } else if (text === "/last_reboot" || text === "/lastreboot") {
    await handleLastReboot(msg.chat.id);
  }
}

async function pollUpdates(): Promise<void> {
  const { botToken } = getTelegramConfig();
  if (!botToken) return;

  try {
    const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=30&allowed_updates=["message"]`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[TelegramBot] getUpdates failed: ${res.status}`);
      return;
    }

    const data = await res.json();
    const updates: TelegramUpdate[] = data.result ?? [];

    for (const update of updates) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);
      try {
        await processUpdate(update);
      } catch (err) {
        console.error("[TelegramBot] Error processing update:", err);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return; // Normal timeout
    console.error("[TelegramBot] Poll error:", err);
  }
}

export async function startTelegramBot(): Promise<void> {
  if (!isTelegramConfigured()) {
    console.log("[TelegramBot] Not configured, skipping bot startup");
    return;
  }

  console.log("[TelegramBot] Starting command listener...");

  // Continuous long-polling loop
  const loop = async () => {
    while (true) {
      await pollUpdates();
      // Small delay between polls to avoid hammering on errors
      await new Promise((r) => setTimeout(r, 1000));
    }
  };

  // Run in background (don't await)
  loop().catch((err) => console.error("[TelegramBot] Fatal error:", err));
}
