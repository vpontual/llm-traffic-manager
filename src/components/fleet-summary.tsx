"use client";

import { formatBytes } from "@/lib/format";

import type { ServerState } from "@/lib/types";



export function FleetSummary({ servers }: { servers: ServerState[] }) {
  const online = servers.filter((s) => s.isOnline);
  const totalVramUsed = servers.reduce((sum, s) => sum + s.totalVramUsed, 0);
  const totalVramCapacity = servers.reduce(
    (sum, s) => sum + s.totalRamGb * 1024 * 1024 * 1024,
    0
  );
  const loadedModels = servers.reduce(
    (sum, s) => sum + s.loadedModels.length,
    0
  );
  const uniqueAvailable = new Set(
    servers.flatMap((s) => s.availableModels.map((m) => m.name))
  ).size;

  // Find hottest CPU temp across fleet
  const temps = servers
    .map((s) => ({ name: s.name, temp: s.systemMetrics?.cpuTempC ?? null }))
    .filter((t) => t.temp != null)
    .sort((a, b) => (b.temp ?? 0) - (a.temp ?? 0));
  const hottest = temps[0];

  // Fleet system RAM
  const fleetRamUsed = servers.reduce(
    (sum, s) => sum + (s.systemMetrics?.memUsedMb ?? 0),
    0
  );
  const fleetRamTotal = servers.reduce(
    (sum, s) => sum + (s.systemMetrics?.memTotalMb ?? 0),
    0
  );

  const stats = [
    { label: "Servers Online", value: `${online.length} / ${servers.length}` },
    { label: "Models Loaded", value: String(loadedModels) },
    {
      label: "Fleet VRAM",
      value: `${formatBytes(totalVramUsed)} / ${formatBytes(totalVramCapacity)}`,
    },
    {
      label: "Hottest CPU",
      value: hottest
        ? `${hottest.temp}°C`
        : "—",
    },
    {
      label: "Fleet RAM",
      value: fleetRamTotal > 0
        ? `${(fleetRamUsed / 1024).toFixed(0)} / ${(fleetRamTotal / 1024).toFixed(0)} GB`
        : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-surface-raised border border-border rounded-lg px-4 py-3"
        >
          <p className="text-xs text-text-muted uppercase tracking-wide">
            {stat.label}
          </p>
          <p className="text-lg font-semibold text-text-primary mt-1">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
