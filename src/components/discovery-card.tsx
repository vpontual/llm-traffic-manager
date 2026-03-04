"use client";

import type { ServiceAffinity } from "@/lib/service-affinity";

export interface DiscoveryData {
  id: number;
  modelName: string;
  modelFamily: string | null;
  families: string[] | null;
  parameterSize: string | null;
  quantization: string | null;
  modelSize: number;
  description: string | null;
  capabilities: string[] | null;
  pullCount: string | null;
  registryExists: boolean | null;
  firstSeenServerName: string;
  infoFetchStatus: string;
  infoFetchedAt: string | null;
  discoveredAt: string;
  serviceAffinities: ServiceAffinity[];
}

const CAPABILITY_COLORS: Record<string, string> = {
  tools: "bg-blue-500/15 text-blue-400",
  vision: "bg-purple-500/15 text-purple-400",
  thinking: "bg-amber-500/15 text-amber-400",
  embedding: "bg-green-500/15 text-green-400",
  code: "bg-cyan-500/15 text-cyan-400",
};

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "-";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function StatusIndicator({ status }: { status: string }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        Enriched
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Partial info
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-text-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-pulse" />
        Fetching...
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-danger">
      <span className="w-1.5 h-1.5 rounded-full bg-danger" />
      Info unavailable
    </span>
  );
}

export function DiscoveryCard({ discovery }: { discovery: DiscoveryData }) {
  const caps = discovery.capabilities ?? [];
  const affinities = discovery.serviceAffinities ?? [];

  return (
    <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-text-primary font-mono truncate">
            {discovery.modelName}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            First seen on <span className="text-text-secondary">{discovery.firstSeenServerName}</span>
            {" "}&middot; {formatTimeAgo(discovery.discoveredAt)}
          </p>
        </div>
        <StatusIndicator status={discovery.infoFetchStatus} />
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Description */}
        {discovery.infoFetchStatus === "pending" ? (
          <p className="text-sm text-text-muted italic">Fetching model info...</p>
        ) : discovery.description ? (
          <p className="text-sm text-text-secondary line-clamp-3">{discovery.description}</p>
        ) : (
          <p className="text-sm text-text-muted italic">No description available</p>
        )}

        {/* Capability badges */}
        {caps.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {caps.map((cap) => (
              <span
                key={cap}
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  CAPABILITY_COLORS[cap] ?? "bg-surface-overlay text-text-secondary"
                }`}
              >
                {cap}
              </span>
            ))}
          </div>
        )}

        {/* Technical details */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          {discovery.parameterSize && (
            <span>
              <span className="text-text-secondary">{discovery.parameterSize}</span> params
            </span>
          )}
          {discovery.quantization && (
            <span>
              <span className="text-text-secondary">{discovery.quantization}</span>
            </span>
          )}
          {discovery.modelSize > 0 && (
            <span>
              <span className="text-text-secondary">{formatBytes(discovery.modelSize)}</span> disk
            </span>
          )}
          {discovery.pullCount && (
            <span>
              <span className="text-text-secondary">{discovery.pullCount}</span> pulls
            </span>
          )}
        </div>

        {/* Service affinities */}
        {affinities.length > 0 && (
          <div className="border-t border-border/50 pt-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
              Potential Upgrade
            </p>
            <div className="space-y-1">
              {affinities.slice(0, 3).map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs bg-accent/5 rounded-md px-2 py-1.5"
                >
                  <span className="text-text-primary font-medium truncate">{a.source}</span>
                  <span className="text-text-muted">uses</span>
                  <span className="text-text-secondary font-mono truncate">{a.currentModel}</span>
                  <span className="text-text-muted">({a.requestCount} req)</span>
                  <span className="ml-auto text-accent text-[11px] shrink-0">
                    {a.familyMatch} family
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
