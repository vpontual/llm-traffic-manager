// Alert threshold rules: pure functions for evaluating server health conditions

export const THRESHOLDS = {
  GPU_TEMP: 90,
  CPU_TEMP: 85,
  DISK_USAGE: 0.9,
  MEM_AVAILABLE: 0.1,
} as const;

export interface AlertCondition {
  alertType: string;
  message: string;
}

interface MetricsInput {
  temperatures: Record<string, number | undefined>;
  disk: { total_gb: number; used_gb: number };
  memory: { total_mb: number; available_mb: number };
}

/**
 * Evaluate server metrics against alert thresholds.
 * Returns an array of alert conditions that should fire.
 * Does NOT handle cooldowns or message delivery.
 */
export function evaluateMetrics(
  serverName: string,
  metrics: MetricsInput
): AlertCondition[] {
  const alerts: AlertCondition[] = [];

  // GPU overheating
  const gpuTemp = metrics.temperatures.gpu;
  if (gpuTemp != null && gpuTemp >= THRESHOLDS.GPU_TEMP) {
    alerts.push({
      alertType: "gpu_temp",
      message: `${serverName} GPU ${Math.round(gpuTemp)}C (threshold: ${THRESHOLDS.GPU_TEMP}C)`,
    });
  }

  // CPU overheating
  const cpuTemp = metrics.temperatures.cpu;
  if (cpuTemp != null && cpuTemp >= THRESHOLDS.CPU_TEMP) {
    alerts.push({
      alertType: "cpu_temp",
      message: `${serverName} CPU ${Math.round(cpuTemp)}C (threshold: ${THRESHOLDS.CPU_TEMP}C)`,
    });
  }

  // Disk nearly full
  if (metrics.disk.total_gb > 0) {
    const diskUsage = metrics.disk.used_gb / metrics.disk.total_gb;
    if (diskUsage >= THRESHOLDS.DISK_USAGE) {
      alerts.push({
        alertType: "disk",
        message: `${serverName} disk at ${Math.round(diskUsage * 100)}%`,
      });
    }
  }

  // Low memory
  if (metrics.memory.total_mb > 0) {
    const availableRatio = metrics.memory.available_mb / metrics.memory.total_mb;
    if (availableRatio < THRESHOLDS.MEM_AVAILABLE) {
      alerts.push({
        alertType: "memory",
        message: `${serverName} memory at ${Math.round((1 - availableRatio) * 100)}%`,
      });
    }
  }

  return alerts;
}

/**
 * Cooldown tracker: prevents duplicate alerts within a time window.
 */
export class AlertCooldown {
  private lastAlerted = new Map<string, number>();

  constructor(private cooldownMs: number) {}

  canAlert(serverName: string, alertType: string): boolean {
    const key = `${serverName}:${alertType}`;
    const last = this.lastAlerted.get(key);
    if (!last) return true;
    return Date.now() - last > this.cooldownMs;
  }

  markAlerted(serverName: string, alertType: string): void {
    this.lastAlerted.set(`${serverName}:${alertType}`, Date.now());
  }

  reset(): void {
    this.lastAlerted.clear();
  }
}
