"use client";

import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TIME_RANGES = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
];

const CHART = {
  accent: "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  muted: "#64748b",
  grid: "#334155",
  text: "#94a3b8",
};

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#1e293b",
    border: "1px solid #475569",
    borderRadius: "8px",
    color: "#f1f5f9",
    fontSize: "13px",
  },
  itemStyle: { color: "#94a3b8" },
};

const REASON_COLORS: Record<string, string> = {
  model_loaded: "#22c55e",
  model_available: "#3b82f6",
  model_available_anti_churn: "#06b6d4",
  fallback_most_vram: "#f59e0b",
  any_online: "#64748b",
  pinned_by_header: "#a855f7",
};

const REASON_LABELS: Record<string, string> = {
  model_loaded: "Model Loaded (instant)",
  model_available: "Model on Disk (needs load)",
  model_available_anti_churn: "On Disk (anti-churn)",
  fallback_most_vram: "Fallback (needs pull)",
  any_online: "Any Online (no model)",
  pinned_by_header: "Pinned by Header",
};

interface AnalyticsData {
  summary: {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    successRate: number;
    medianLatencyMs: number;
    p95LatencyMs: number;
    uniqueModels: number;
    uniqueSources: number;
  };
  requestsOverTime: Array<{
    bucket: string;
    count: number;
    errorCount: number;
  }>;
  latencyOverTime: Array<{
    bucket: string;
    medianMs: number;
    p95Ms: number;
  }>;
  modelDistribution: Array<{
    model: string;
    count: number;
    percentage: number;
  }>;
  sourceDistribution: Array<{
    source: string;
    count: number;
    percentage: number;
  }>;
  serverDistribution: Array<{
    serverName: string;
    serverId: number;
    count: number;
    percentage: number;
  }>;
  errorBreakdown: Array<{
    statusCode: number;
    count: number;
  }>;
  routingReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }> | null;
}

function formatBucketLabel(bucket: string, hours: number): string {
  const d = new Date(bucket);
  if (hours <= 168) {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function AnalyticsPage() {
  const [hours, setHours] = useState(168);

  const { data, isLoading } = useSWR<AnalyticsData>(
    `/api/analytics?hours=${hours}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  return (
    <div className="max-w-[1440px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            &larr;
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
        </div>
        <div className="flex items-center gap-2">
          {TIME_RANGES.map((r) => (
            <button
              key={r.hours}
              onClick={() => setHours(r.hours)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                hours === r.hours
                  ? "bg-accent/20 border-accent text-accent"
                  : "bg-surface-raised border-border text-text-secondary hover:text-text-primary hover:border-accent"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-20 text-text-muted">
          Loading analytics...
        </div>
      )}

      {/* Empty state */}
      {data && data.summary.totalRequests === 0 && (
        <div className="bg-surface-raised border border-border rounded-xl p-8 text-center text-text-muted">
          No request data in this time range.
        </div>
      )}

      {data && data.summary.totalRequests > 0 && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <StatBox label="Total Requests" value={data.summary.totalRequests.toLocaleString()} />
            <StatBox
              label="Success Rate"
              value={`${data.summary.successRate}%`}
              color={data.summary.successRate >= 99 ? "text-success" : data.summary.successRate >= 95 ? "text-warning" : "text-danger"}
            />
            <StatBox label="Median Latency" value={formatMs(data.summary.medianLatencyMs)} />
            <StatBox label="P95 Latency" value={formatMs(data.summary.p95LatencyMs)} />
            <StatBox label="Models" value={String(data.summary.uniqueModels)} />
            <StatBox label="Sources" value={String(data.summary.uniqueSources)} />
          </div>

          {/* Requests Over Time */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
              Requests Over Time
            </h2>
            <div className="bg-surface-raised border border-border rounded-xl p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.requestsOverTime}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART.grid}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(v) => formatBucketLabel(v, hours)}
                    stroke={CHART.text}
                    fontSize={11}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={CHART.text}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    labelFormatter={(v) => formatBucketLabel(String(v), hours)}
                  />
                  <Bar
                    dataKey="count"
                    fill={CHART.accent}
                    radius={[2, 2, 0, 0]}
                    name="Requests"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Distribution Row */}
          <section className="mb-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Model Distribution */}
              <div className="bg-surface-raised border border-border rounded-xl p-4">
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
                  Models
                </h2>
                <div className="space-y-2">
                  {data.modelDistribution.map((m) => (
                    <DistributionBar
                      key={m.model}
                      label={m.model}
                      count={m.count}
                      percentage={m.percentage}
                      color={CHART.accent}
                    />
                  ))}
                </div>
              </div>

              {/* Source Distribution */}
              <div className="bg-surface-raised border border-border rounded-xl p-4">
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
                  Sources
                </h2>
                <div className="space-y-2">
                  {data.sourceDistribution.map((s) => (
                    <DistributionBar
                      key={s.source}
                      label={s.source}
                      count={s.count}
                      percentage={s.percentage}
                      color={CHART.accent}
                    />
                  ))}
                </div>
              </div>

              {/* Server Distribution */}
              <div className="bg-surface-raised border border-border rounded-xl p-4">
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
                  Servers
                </h2>
                <div className="space-y-2">
                  {data.serverDistribution.map((s) => (
                    <DistributionBar
                      key={s.serverId}
                      label={s.serverName}
                      count={s.count}
                      percentage={s.percentage}
                      color={CHART.success}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Latency Over Time */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
              Latency Over Time
            </h2>
            <div className="bg-surface-raised border border-border rounded-xl p-4">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.latencyOverTime}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART.grid}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(v) => formatBucketLabel(v, hours)}
                    stroke={CHART.text}
                    fontSize={11}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={CHART.text}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatMs(v)}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    labelFormatter={(v) => formatBucketLabel(String(v), hours)}
                    formatter={(value, name) => [
                      formatMs(Number(value) || 0),
                      name ?? "",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="medianMs"
                    stroke={CHART.accent}
                    name="Median"
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="p95Ms"
                    stroke={CHART.warning}
                    name="P95"
                    dot={false}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 px-2">
                <span className="flex items-center gap-1.5 text-xs text-text-muted">
                  <span
                    className="inline-block w-4 h-0.5"
                    style={{ backgroundColor: CHART.accent }}
                  />
                  Median
                </span>
                <span className="flex items-center gap-1.5 text-xs text-text-muted">
                  <span
                    className="inline-block w-4 h-0.5 border-t-2 border-dashed"
                    style={{ borderColor: CHART.warning }}
                  />
                  P95
                </span>
              </div>
            </div>
          </section>

          {/* Routing Quality */}
          {data.routingReasons && data.routingReasons.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
                Routing Quality
              </h2>
              <div className="bg-surface-raised border border-border rounded-xl p-4">
                <div className="space-y-2">
                  {data.routingReasons.map((r) => (
                    <DistributionBar
                      key={r.reason}
                      label={REASON_LABELS[r.reason] ?? r.reason}
                      count={r.count}
                      percentage={r.percentage}
                      color={REASON_COLORS[r.reason] ?? CHART.muted}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Errors */}
          {data.errorBreakdown.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
                Errors
              </h2>
              <div className="flex flex-wrap gap-2">
                {data.errorBreakdown.map(({ statusCode, count }) => (
                  <span
                    key={statusCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger/15 text-danger text-sm font-mono"
                  >
                    {statusCode}{" "}
                    <span className="text-text-muted">
                      x{count.toLocaleString()}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-surface-raised border border-border rounded-lg px-4 py-3">
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${color ?? "text-text-primary"}`}>
        {value}
      </p>
    </div>
  );
}

function DistributionBar({
  label,
  count,
  percentage,
  color,
}: {
  label: string;
  count: number;
  percentage: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-text-primary font-mono truncate max-w-[60%]">
          {label}
        </span>
        <span className="text-xs text-text-muted">
          {count.toLocaleString()} ({percentage}%)
        </span>
      </div>
      <div className="h-2 bg-surface-overlay/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
