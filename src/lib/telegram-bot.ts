import { db } from "./db";
import { servers, serverSnapshots, systemMetrics, serverEvents, userTelegramConfigs } from "./schema";
import { eq, desc, and } from "drizzle-orm";
import { getTelegramConfig, isTelegramConfigured } from "./telegram";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
}

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

async function sendReply(botToken: string, chatId: number, text: string): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error(`[TelegramBot] Reply failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error("[TelegramBot] Reply error:", err);
  }
}

async function handleStatus(botToken: string, chatId: number): Promise<void> {
  const allServers = await db.select().from(servers);
  const lines: string[] = ["<b>Fleet Status</b>\n"];

  for (const server of allServers) {
    const [snap] = await db
      .select()
      .from(serverSnapshots)
      .where(eq(serverSnapshots.serverId, server.id))
      .orderBy(desc(serverSnapshots.polledAt))
      .limit(1);

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

  await sendReply(botToken, chatId, lines.join("\n"));
}

async function handleLastReboot(botToken: string, chatId: number): Promise<void> {
  const allServers = await db.select().from(servers);
  const lines: string[] = ["<b>Recent Reboots</b>\n"];

  for (const server of allServers) {
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

  await sendReply(botToken, chatId, lines.join("\n"));
}

async function handleHelp(botToken: string, chatId: number): Promise<void> {
  const text = [
    "<b>Available Commands</b>\n",
    "/status \u2014 Show fleet status: online/offline state, uptime, and loaded models for each server",
    "/last_reboot \u2014 Show the most recent reboot for each server with timestamp and cause",
    "/help \u2014 Show this list of commands",
  ].join("\n");
  await sendReply(botToken, chatId, text);
}

async function processCommand(botToken: string, chatId: number, text: string): Promise<void> {
  const cmd = text.trim().toLowerCase().split("@")[0];
  if (cmd === "/status") {
    await handleStatus(botToken, chatId);
  } else if (cmd === "/last_reboot" || cmd === "/lastreboot") {
    await handleLastReboot(botToken, chatId);
  } else if (cmd === "/help" || cmd === "/start") {
    await handleHelp(botToken, chatId);
  }
}

// --- Per-bot polling loop management ---

interface BotListener {
  botToken: string;
  chatId: string;
  label: string;
  lastUpdateId: number;
  running: boolean;
}

const activeListeners = new Map<string, BotListener>();

async function pollBotUpdates(listener: BotListener): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${listener.botToken}/getUpdates?offset=${listener.lastUpdateId + 1}&timeout=30&allowed_updates=["message"]`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[TelegramBot:${listener.label}] getUpdates failed: ${res.status}`);
      return;
    }

    const data = await res.json();
    const updates: TelegramUpdate[] = data.result ?? [];

    for (const update of updates) {
      listener.lastUpdateId = Math.max(listener.lastUpdateId, update.update_id);
      const msg = update.message;
      if (!msg?.text) continue;

      // Only respond to the configured chat for this bot
      if (String(msg.chat.id) !== listener.chatId) continue;

      try {
        await processCommand(listener.botToken, msg.chat.id, msg.text);
      } catch (err) {
        console.error(`[TelegramBot:${listener.label}] Error processing command:`, err);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return;
    console.error(`[TelegramBot:${listener.label}] Poll error:`, err);
  }
}

function startBotLoop(listener: BotListener): void {
  listener.running = true;

  const loop = async () => {
    while (listener.running) {
      await pollBotUpdates(listener);
      await new Promise((r) => setTimeout(r, 1000));
    }
  };

  loop().catch((err) => {
    console.error(`[TelegramBot:${listener.label}] Fatal error:`, err);
    listener.running = false;
  });
}

async function syncUserBotListeners(): Promise<void> {
  try {
    const configs = await db
      .select({
        botToken: userTelegramConfigs.botToken,
        chatId: userTelegramConfigs.chatId,
        userId: userTelegramConfigs.userId,
        isEnabled: userTelegramConfigs.isEnabled,
      })
      .from(userTelegramConfigs);

    const currentTokens = new Set<string>();

    for (const config of configs) {
      if (!config.isEnabled) continue;
      currentTokens.add(config.botToken);

      // Skip if already listening on this token
      if (activeListeners.has(config.botToken)) continue;

      const listener: BotListener = {
        botToken: config.botToken,
        chatId: config.chatId,
        label: `user-${config.userId}`,
        lastUpdateId: 0,
        running: false,
      };

      activeListeners.set(config.botToken, listener);
      startBotLoop(listener);
      console.log(`[TelegramBot] Started listener for user-${config.userId}`);
    }

    // Stop listeners for removed/disabled configs
    for (const [token, listener] of activeListeners) {
      if (!currentTokens.has(token)) {
        listener.running = false;
        activeListeners.delete(token);
        console.log(`[TelegramBot] Stopped listener: ${listener.label}`);
      }
    }
  } catch (err) {
    console.error("[TelegramBot] Error syncing user listeners:", err);
  }
}

export async function startTelegramBot(): Promise<void> {
  // Start global bot listener (from env vars) if configured
  if (isTelegramConfigured()) {
    const { botToken, chatId } = getTelegramConfig();
    if (botToken && chatId) {
      const globalListener: BotListener = {
        botToken,
        chatId,
        label: "global",
        lastUpdateId: 0,
        running: false,
      };
      activeListeners.set(botToken, globalListener);
      startBotLoop(globalListener);
      console.log("[TelegramBot] Started global command listener");
    }
  }

  // Start per-user bot listeners
  await syncUserBotListeners();

  // Re-sync every 60s to pick up new/changed/removed user configs
  setInterval(syncUserBotListeners, 60000);
}
