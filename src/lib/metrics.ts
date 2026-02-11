const TIMEOUT_MS = 3000;

export interface MetricsAgentResponse {
  hostname: string;
  uptime_seconds: number;
  boot_time: string;
  temperatures: Record<string, number>;
  memory: {
    total_mb: number;
    used_mb: number;
    available_mb: number;
    swap_total_mb: number;
    swap_used_mb: number;
  };
  load_avg: [number, number, number];
  recent_boots: string[];
  disk: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
  };
}

export async function fetchSystemMetrics(
  metricsHost: string
): Promise<MetricsAgentResponse | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`http://${metricsHost}/metrics`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
