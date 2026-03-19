// Server health alerts -- monitors temps, disk, memory, reboots via Telegram

import { isTelegramConfigured, sendTelegramMessage } from "./telegram";
import { formatUptime } from "./format";
import type { MetricsAgentResponse } from "./metrics";
import { AlertCooldown, evaluateMetrics } from "./alert-rules";

// Cooldown instance
const cooldown = new AlertCooldown(30 * 60 * 1000);

// Telegram-formatted alert messages per alert type
const ALERT_FORMATS: Record<string, (serverName: string, metrics: MetricsAgentResponse) => string> = {
  gpu_temp: (s, m) =>
    `*\ud83d\udd25 GPU Overheating*\n\n*${s}*\nGPU temperature: ${Math.round(m.temperatures.gpu!)}°C`,
  cpu_temp: (s, m) =>
    `*\ud83d\udd25 CPU Overheating*\n\n*${s}*\nCPU temperature: ${Math.round(m.temperatures.cpu!)}°C`,
  disk: (s, m) => {
    const pct = Math.round((m.disk.used_gb / m.disk.total_gb) * 100);
    return `*\ud83d\udcbe Disk Nearly Full*\n\n*${s}*\nDisk usage: ${pct}% (${(m.disk.total_gb - m.disk.used_gb).toFixed(0)}GB free)`;
  },
  memory: (s, m) => {
    const pct = Math.round((1 - m.memory.available_mb / m.memory.total_mb) * 100);
    return `*\ud83d\udca8 Low Memory*\n\n*${s}*\nMemory usage: ${pct}% (${m.memory.available_mb}MB available of ${m.memory.total_mb}MB)`;
  },
};

// Track previous boot lists per server to detect new boots
const previousBoots = new Map<string, Set<string>>();

export async function checkServerAlerts(
  serverName: string,
  isOnline: boolean,
  metrics: MetricsAgentResponse | null
): Promise<void> {
  if (!isTelegramConfigured()) return;

  // Server offline
  if (!isOnline) {
    if (cooldown.canAlert(serverName, "offline")) {
      cooldown.markAlerted(serverName, "offline");
      await sendTelegramMessage(
        `*\u26a0\ufe0f Server Offline*\n\n*${serverName}* is not responding.`
      );
      console.log(`[Alert] ${serverName}: offline`);
    }
    return;
  }

  if (!metrics) return;

  // Use evaluateMetrics for threshold checks (single source of truth)
  const conditions = evaluateMetrics(serverName, metrics);
  for (const condition of conditions) {
    if (!cooldown.canAlert(serverName, condition.alertType)) continue;
    cooldown.markAlerted(serverName, condition.alertType);

    const formatter = ALERT_FORMATS[condition.alertType];
    const message = formatter ? formatter(serverName, metrics) : condition.message;
    await sendTelegramMessage(message);
    console.log(`[Alert] ${serverName}: ${condition.alertType}`);
  }

  // Unexpected reboot detection
  if (metrics.recent_boots && metrics.recent_boots.length > 0) {
    const currentBoots = new Set(metrics.recent_boots);
    const prevBoots = previousBoots.get(serverName);

    if (prevBoots) {
      for (const boot of currentBoots) {
        if (!prevBoots.has(boot)) {
          if (cooldown.canAlert(serverName, "reboot")) {
            cooldown.markAlerted(serverName, "reboot");
            await sendTelegramMessage(
              `*\ud83d\udd04 Server Rebooted*\n\n*${serverName}*\nBoot detected at: ${boot}\nUptime: ${formatUptime(metrics.uptime_seconds)}`
            );
            console.log(`[Alert] ${serverName}: reboot`);
          }
          break;
        }
      }
    }

    previousBoots.set(serverName, currentBoots);
  }
}
