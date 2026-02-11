import { isTelegramConfigured, sendTelegramMessage } from "./telegram";
import type { MetricsAgentResponse } from "./metrics";

// Cooldown: don't re-alert for the same issue within this window (ms)
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Thresholds
const GPU_TEMP_THRESHOLD = 90; // °C
const CPU_TEMP_THRESHOLD = 85; // °C
const DISK_USAGE_THRESHOLD = 0.9; // 90%
const MEM_AVAILABLE_THRESHOLD = 0.1; // alert when available < 10% of total

// Track last alert time per server per alert type
const lastAlerted = new Map<string, number>();

function alertKey(serverName: string, alertType: string): string {
  return `${serverName}:${alertType}`;
}

function canAlert(serverName: string, alertType: string): boolean {
  const key = alertKey(serverName, alertType);
  const last = lastAlerted.get(key);
  if (!last) return true;
  return Date.now() - last > COOLDOWN_MS;
}

function markAlerted(serverName: string, alertType: string): void {
  lastAlerted.set(alertKey(serverName, alertType), Date.now());
}

async function alert(serverName: string, alertType: string, message: string): Promise<void> {
  if (!canAlert(serverName, alertType)) return;
  markAlerted(serverName, alertType);
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
  if (metrics.temperatures.gpu != null && metrics.temperatures.gpu >= GPU_TEMP_THRESHOLD) {
    await alert(serverName, "gpu_temp",
      `<b>\ud83d\udd25 GPU Overheating</b>\n\n<b>${serverName}</b>\nGPU temperature: ${Math.round(metrics.temperatures.gpu)}\u00b0C (threshold: ${GPU_TEMP_THRESHOLD}\u00b0C)`
    );
  }

  // CPU overheating
  if (metrics.temperatures.cpu != null && metrics.temperatures.cpu >= CPU_TEMP_THRESHOLD) {
    await alert(serverName, "cpu_temp",
      `<b>\ud83d\udd25 CPU Overheating</b>\n\n<b>${serverName}</b>\nCPU temperature: ${Math.round(metrics.temperatures.cpu)}\u00b0C (threshold: ${CPU_TEMP_THRESHOLD}\u00b0C)`
    );
  }

  // Disk nearly full
  if (metrics.disk.total_gb > 0) {
    const diskUsage = metrics.disk.used_gb / metrics.disk.total_gb;
    if (diskUsage >= DISK_USAGE_THRESHOLD) {
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
    if (availableRatio < MEM_AVAILABLE_THRESHOLD) {
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

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
