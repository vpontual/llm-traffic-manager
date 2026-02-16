// Server health alerts -- monitors temps, disk, memory, reboots via Telegram

import { isTelegramConfigured, sendTelegramMessage } from "./telegram";
import { formatUptime } from "./format";
import type { MetricsAgentResponse } from "./metrics";
import { AlertCooldown, THRESHOLDS } from "./alert-rules";

// Cooldown instance
const cooldown = new AlertCooldown(30 * 60 * 1000);

async function alert(serverName: string, alertType: string, message: string): Promise<void> {
  if (!cooldown.canAlert(serverName, alertType)) return;
  cooldown.markAlerted(serverName, alertType);
  await sendTelegramMessage(message);
  console.log(`[Alert] ${serverName}: ${alertType}`);
}

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
    await alert(serverName, "offline",
      `<b>\u26a0\ufe0f Server Offline</b>\n\n<b>${serverName}</b> is not responding.`
    );
    return; // No point checking metrics if server is down
  }

  if (!metrics) return;

  // GPU overheating
  if (metrics.temperatures.gpu != null && metrics.temperatures.gpu >= THRESHOLDS.GPU_TEMP) {
    await alert(serverName, "gpu_temp",
      `<b>\ud83d\udd25 GPU Overheating</b>\n\n<b>${serverName}</b>\nGPU temperature: ${Math.round(metrics.temperatures.gpu)}\u00b0C (threshold: ${THRESHOLDS.GPU_TEMP}\u00b0C)`
    );
  }

  // CPU overheating
  if (metrics.temperatures.cpu != null && metrics.temperatures.cpu >= THRESHOLDS.CPU_TEMP) {
    await alert(serverName, "cpu_temp",
      `<b>\ud83d\udd25 CPU Overheating</b>\n\n<b>${serverName}</b>\nCPU temperature: ${Math.round(metrics.temperatures.cpu)}\u00b0C (threshold: ${THRESHOLDS.CPU_TEMP}\u00b0C)`
    );
  }

  // Disk nearly full
  if (metrics.disk.total_gb > 0) {
    const diskUsage = metrics.disk.used_gb / metrics.disk.total_gb;
    if (diskUsage >= THRESHOLDS.DISK_USAGE) {
      const pct = Math.round(diskUsage * 100);
      const freeGb = metrics.disk.total_gb - metrics.disk.used_gb;
      await alert(serverName, "disk",
        `<b>\ud83d\udcbe Disk Nearly Full</b>\n\n<b>${serverName}</b>\nDisk usage: ${pct}% (${freeGb}GB free of ${metrics.disk.total_gb}GB)`
      );
    }
  }

  // Low memory
  if (metrics.memory.total_mb > 0) {
    const availableRatio = metrics.memory.available_mb / metrics.memory.total_mb;
    if (availableRatio < THRESHOLDS.MEM_AVAILABLE) {
      const pct = Math.round((1 - availableRatio) * 100);
      await alert(serverName, "memory",
        `<b>\ud83d\udca8 Low Memory</b>\n\n<b>${serverName}</b>\nMemory usage: ${pct}% (${metrics.memory.available_mb}MB available of ${metrics.memory.total_mb}MB)`
      );
    }
  }

  // Unexpected reboot
  if (metrics.recent_boots && metrics.recent_boots.length > 0) {
    const currentBoots = new Set(metrics.recent_boots);
    const prevBoots = previousBoots.get(serverName);

    if (prevBoots) {
      for (const boot of currentBoots) {
        if (!prevBoots.has(boot)) {
          await alert(serverName, "reboot",
            `<b>\ud83d\udd04 Server Rebooted</b>\n\n<b>${serverName}</b>\nBoot detected at: ${boot}\nUptime: ${formatUptime(metrics.uptime_seconds)}`
          );
          break; // One alert is enough even if multiple new boots
        }
      }
    }

    previousBoots.set(serverName, currentBoots);
  }
}


