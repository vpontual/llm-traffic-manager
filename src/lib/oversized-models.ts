// Pure function to detect models that are too large for their host server's RAM.
// A model is "oversized" if its on-disk size exceeds 80% of server RAM,
// leaving insufficient headroom for OS, KV cache, and context window.

export interface OversizedModelRecommendation {
  modelName: string;
  serverName: string;
  serverId: number;
  modelSizeGb: number;
  serverRamGb: number;
  usagePercent: number;
  availableOn: string[];
}

export interface ServerModelInfo {
  serverId: number;
  serverName: string;
  totalRamGb: number;
  models: Array<{ name: string; size: number }>;
}

const RAM_THRESHOLD = 0.80;

export function findOversizedModels(
  serversWithModels: ServerModelInfo[],
  availabilityMap: Map<string, string[]>,
): OversizedModelRecommendation[] {
  const results: OversizedModelRecommendation[] = [];

  for (const server of serversWithModels) {
    const ramBytes = server.totalRamGb * 1024 ** 3;
    const threshold = ramBytes * RAM_THRESHOLD;

    for (const model of server.models) {
      if (model.size > threshold) {
        const modelSizeGb = Math.round((model.size / 1024 ** 3) * 10) / 10;
        const usagePercent =
          Math.round((model.size / ramBytes) * 1000) / 10;
        const availableOn = availabilityMap.get(model.name) ?? [];

        results.push({
          modelName: model.name,
          serverName: server.serverName,
          serverId: server.serverId,
          modelSizeGb,
          serverRamGb: server.totalRamGb,
          usagePercent,
          availableOn,
        });
      }
    }
  }

  // Worst offenders first
  results.sort((a, b) => b.usagePercent - a.usagePercent);
  return results;
}
