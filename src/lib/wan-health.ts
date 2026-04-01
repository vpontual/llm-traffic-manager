// WAN health monitor -- detects internet outages and suppresses alerts during downtime

import { readPositiveIntEnv } from "./env";
import { isTelegramConfigured, sendTelegramMessage } from "./telegram";
import * as net from "net";

// --- In-memory state ---
let wanUp = true;
let consecutiveFailures = 0;
let outageStartTime: Date | null = null;

// TCP targets to probe (no DNS needed)
const PROBE_TARGETS = [
  { host: "1.1.1.1", port: 443 },
  { host: "8.8.8.8", port: 53 },
];
const PROBE_TIMEOUT_MS = 3000;

/** TCP connect probe — resolves true if connection succeeds within timeout. */
function tcpProbe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, PROBE_TIMEOUT_MS);

    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

/** Probe external connectivity. Returns true if at least one target is reachable. */
async function probeWan(): Promise<boolean> {
  for (const target of PROBE_TARGETS) {
    if (await tcpProbe(target.host, target.port)) {
      return true;
    }
  }
  return false;
}

/** Format a duration in milliseconds to a human-readable string. */
function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 1) return "<1 minute";
  if (totalMinutes === 1) return "1 minute";
  return `${totalMinutes} minutes`;
}

/** Format a Date to HH:MM local time. */
function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Check WAN connectivity. Called once per poll cycle.
 * Implements consecutive-failure gating before declaring WAN down.
 */
export async function checkWan(): Promise<void> {
  const threshold = readPositiveIntEnv("WAN_OFFLINE_THRESHOLD", 3);
  const reachable = await probeWan();

  if (!reachable) {
    consecutiveFailures++;

    if (wanUp && consecutiveFailures >= threshold) {
      // Transition: UP -> DOWN
      wanUp = false;
      outageStartTime = new Date();
      console.log(`[WAN] Internet connectivity lost (${consecutiveFailures} consecutive failures)`);
    } else if (wanUp) {
      console.log(`[WAN] Probe failed (${consecutiveFailures}/${threshold})`);
    }
  } else {
    if (!wanUp && outageStartTime) {
      // Transition: DOWN -> UP
      const now = new Date();
      const durationMs = now.getTime() - outageStartTime.getTime();
      const duration = formatDuration(durationMs);
      const startStr = formatTime(outageStartTime);
      const endStr = formatTime(now);

      console.log(`[WAN] Internet connectivity restored after ${duration}`);

      // Send consolidated recovery alert via Telegram
      if (isTelegramConfigured()) {
        const message =
          `*🌐 Internet Outage Resolved*\n\n` +
          `WAN connectivity was lost for ~${duration} (${startStr} - ${endStr}).\n` +
          `This was an ISP issue — all local services remained operational.`;

        sendTelegramMessage(message).catch((err) =>
          console.error("[WAN] Failed to send recovery alert:", err)
        );
      }

      outageStartTime = null;
    }

    consecutiveFailures = 0;
    wanUp = true;
  }
}

/** Start the WAN health monitor on its own interval (default 60s). */
export function startWanMonitor(): void {
  const intervalSec = readPositiveIntEnv("WAN_CHECK_INTERVAL", 60);

  // Initial check
  checkWan().catch((err) => console.error("[WAN] Initial check error:", err));

  setInterval(() => {
    checkWan().catch((err) => console.error("[WAN] Check error:", err));
  }, intervalSec * 1000);

  console.log("[WAN] Health monitor started (checking every " + intervalSec + "s)");
}

/** Returns true if WAN is currently considered up. */
export function isWanUp(): boolean {
  return wanUp;
}

/** Returns the start time of the current outage, or null if WAN is up. */
export function getWanOutageStart(): Date | null {
  return outageStartTime;
}
