"use client";

import useSWR from "swr";
import { formatBytes } from "@/lib/format";
import type { ServerState } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function FleetTicker() {
  const { data: servers } = useSWR<ServerState[]>("/api/servers", fetcher, {
    refreshInterval: 5000,
  });

  if (!servers) return null;

  const online = servers.filter((s) => s.isOnline).length;
  const total = servers.length;
  const loadedModels = servers.reduce((sum, s) => sum + s.loadedModels.length, 0);
  const totalVramUsed = servers.reduce((sum, s) => sum + s.totalVramUsed, 0);
  const totalVramCap = servers.reduce((sum, s) => sum + s.totalRamGb * 1024 * 1024 * 1024, 0);
  const vramPct = totalVramCap > 0 ? Math.round((totalVramUsed / totalVramCap) * 100) : 0;

  const temps = servers
    .map((s) => ({ name: s.name, temp: s.systemMetrics?.cpuTempC ?? null }))
    .filter((t) => t.temp != null)
    .sort((a, b) => (b.temp ?? 0) - (a.temp ?? 0));
  const hottest = temps[0];

  const items = [
    {
      label: "Fleet",
      value: `${online}/${total} online`,
      color: online === total ? "text-green-400" : "text-amber-400",
    },
    {
      label: "Models",
      value: `${loadedModels} loaded`,
      color: "text-text-secondary",
    },
    {
      label: "VRAM",
      value: `${formatBytes(totalVramUsed)} / ${formatBytes(totalVramCap)} (${vramPct}%)`,
      color: vramPct > 85 ? "text-amber-400" : "text-text-secondary",
    },
    ...(hottest
      ? [
          {
            label: "Peak Temp",
            value: `${hottest.temp}°C ${hottest.name}`,
            color:
              (hottest.temp ?? 0) >= 80
                ? "text-red-400"
                : (hottest.temp ?? 0) >= 65
                  ? "text-amber-400"
                  : "text-text-secondary",
          },
        ]
      : []),
  ];

  return (
    <div className="bg-surface border-b border-border/50 overflow-x-auto">
      <div className="max-w-[1440px] mx-auto px-4 flex items-center gap-6 h-7 text-[12px]">
        {items.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 shrink-0">
            <span className="text-text-muted">{item.label}</span>
            <span className={item.color}>{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
