"use client";

import type { ServerState } from "@/lib/types";
import { VramBar } from "./vram-bar";

function isPinned(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const year = new Date(expiresAt).getFullYear();
  return year >= 2100;
}

function formatUptime(loadedAt: string): string {
  const ms = Date.now() - new Date(loadedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
}

function formatUptimeSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
}

function tempColor(c: number | null): string {
  if (c == null) return "text-text-muted";
  if (c >= 70) return "text-danger";
  if (c >= 50) return "text-warning";
  return "text-success";
}

function recentRebootCount(boots: string[]): number {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return boots.filter((b) => new Date(b).getTime() > oneDayAgo).length;
}

function utilColor(pct: number): string {
  if (pct >= 90) return "bg-danger";
  if (pct >= 70) return "bg-warning";
  return "bg-accent";
}

function UtilBar({ label, percent, temp }: { label: string; percent: number | null | undefined; temp: number | null | undefined }) {
  const pct = percent ?? 0;
  const hasData = percent != null;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted">
          {hasData ? `${pct}%` : "—"}
          {temp != null && <span className={`ml-2 ${tempColor(temp)}`}>{temp}°C</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-base overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${hasData ? utilColor(pct) : "bg-surface-base"}`}
          style={{ width: `${hasData ? pct : 0}%` }}
        />
      </div>
    </div>
  );
}

export function ServerCard({
  server,
  latestVersion,
}: {
  server: ServerState;
  latestVersion: string | null;
}) {
  const modelCount = server.loadedModels.length;
  const isOutdated =
    latestVersion &&
    server.ollamaVersion &&
    server.ollamaVersion !== latestVersion;

  return (
    <div className="bg-surface-raised border border-border rounded-xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {server.name}
          </h2>
          <p className="text-sm text-text-muted font-mono">{server.host}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              server.isOnline ? "bg-success" : "bg-danger"
            }`}
          />
          <span
            className={`text-sm font-medium ${
              server.isOnline ? "text-success" : "text-danger"
            }`}
          >
            {server.isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {/* Info row */}
      <div className="flex gap-4 text-sm text-text-secondary mb-4">
        <span>RAM: {server.totalRamGb} GB</span>
        {server.ollamaVersion && (
          <span className={isOutdated ? "text-warning" : ""}>
            v{server.ollamaVersion}
            {isOutdated && " (outdated)"}
          </span>
        )}
      </div>

      {/* VRAM bar */}
      <div className="mb-4">
        <VramBar used={server.totalVramUsed} totalGb={server.totalRamGb} />
      </div>

      {/* System metrics */}
      {server.systemMetrics && (
        <div className="mb-4">
          <p className="text-xs text-text-muted uppercase tracking-wide mb-2">
            System
          </p>
          {/* CPU & GPU utilization bars */}
          <div className="space-y-2 mb-3">
            <UtilBar label="CPU" percent={server.systemMetrics.cpuPercent} temp={server.systemMetrics.cpuTempC} />
            <UtilBar label="GPU" percent={server.systemMetrics.gpuPercent} temp={server.systemMetrics.gpuTempC} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {/* Memory */}
            <div className="flex justify-between">
              <span className="text-text-secondary">RAM</span>
              <span className="text-text-primary">
                {(server.systemMetrics.memUsedMb / 1024).toFixed(1)} /{" "}
                {(server.systemMetrics.memTotalMb / 1024).toFixed(0)} GB
              </span>
            </div>
            {/* Disk */}
            <div className="flex justify-between">
              <span className="text-text-secondary">Disk</span>
              <span className="text-text-primary">
                {server.systemMetrics.diskUsedGb} /{" "}
                {server.systemMetrics.diskTotalGb} GB
              </span>
            </div>
            {/* Uptime */}
            <div className="flex justify-between">
              <span className="text-text-secondary">Uptime</span>
              <span className="text-text-primary">
                {formatUptimeSeconds(server.systemMetrics.uptimeSeconds)}
              </span>
            </div>
            {/* Load */}
            <div className="flex justify-between">
              <span className="text-text-secondary">Load</span>
              <span className="text-text-primary">
                {server.systemMetrics.loadAvg[0].toFixed(2)}
              </span>
            </div>
          </div>
          {/* Swap if used */}
          {server.systemMetrics.swapUsedMb > 0 && (
            <div className="flex justify-between text-sm mt-1.5">
              <span className="text-text-secondary">Swap</span>
              <span className="text-warning">
                {(server.systemMetrics.swapUsedMb / 1024).toFixed(1)} /{" "}
                {(server.systemMetrics.swapTotalMb / 1024).toFixed(0)} GB
              </span>
            </div>
          )}
          {/* Reboot warning */}
          {recentRebootCount(server.systemMetrics.recentBoots) > 1 && (
            <div className="mt-2 px-2.5 py-1.5 bg-danger/10 border border-danger/20 rounded-lg text-xs text-danger">
              {recentRebootCount(server.systemMetrics.recentBoots)} reboots in
              last 24h
            </div>
          )}
        </div>
      )}

      {/* Loaded models list */}
      <div>
        <p className="text-xs text-text-muted uppercase tracking-wide mb-2">
          Loaded Models ({modelCount})
        </p>
        {modelCount === 0 ? (
          <p className="text-sm text-text-muted italic">No models loaded</p>
        ) : (
          <ul className="space-y-1.5">
            {server.loadedModels.map((model) => {
              const loadedAt = server.modelLoadTimes?.[model.name];
              const pinned = isPinned(model.expires_at);
              return (
                <li
                  key={model.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-text-primary font-mono truncate mr-2">
                    {pinned && (
                      <span className="text-accent mr-1.5" title="Pinned (never expires)">
                        &bull;
                      </span>
                    )}
                    {model.name}
                  </span>
                  <span className="text-text-muted text-xs whitespace-nowrap">
                    {loadedAt && (
                      <span className="text-text-muted mr-2">
                        {formatUptime(loadedAt)}
                      </span>
                    )}
                    {model.details?.parameter_size ?? ""}
                    {model.details?.quantization_level
                      ? ` ${model.details.quantization_level}`
                      : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
