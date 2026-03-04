"use client";

import useSWR from "swr";
import { useState } from "react";
import { DiscoveryCard, type DiscoveryData } from "@/components/discovery-card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TIME_RANGES = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
];

interface DiscoveriesResponse {
  discoveries: DiscoveryData[];
  periodHours: number;
}

export default function DiscoveriesPage() {
  const [hours, setHours] = useState(168);

  const { data, isLoading } = useSWR<DiscoveriesResponse>(
    `/api/discoveries?hours=${hours}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const discoveries = data?.discoveries ?? [];

  return (
    <div id="main-content" className="max-w-[1440px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            Discoveries
          </h1>
          <p className="text-sm text-text-muted mt-1">
            New models detected across the fleet, enriched with info and upgrade suggestions
          </p>
        </div>
        <div className="flex gap-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range.hours}
              onClick={() => setHours(range.hours)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                hours === range.hours
                  ? "bg-accent text-white"
                  : "bg-surface-raised text-text-muted hover:text-text-secondary border border-border"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-surface-raised border border-border rounded-xl p-12 text-center text-text-muted">
          Loading discoveries...
        </div>
      ) : discoveries.length === 0 ? (
        <div className="bg-surface-raised border border-border rounded-xl p-12 text-center">
          <p className="text-text-muted mb-2">No model discoveries yet</p>
          <p className="text-sm text-text-muted">
            New models will appear here automatically when they&apos;re pulled to any fleet server.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {discoveries.map((d) => (
            <DiscoveryCard key={d.id} discovery={d} />
          ))}
        </div>
      )}
    </div>
  );
}
