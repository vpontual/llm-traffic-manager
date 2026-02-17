"use client";

// History page -- request logs, model events, usage tracking

import useSWR from "swr";
import type { ModelEvent } from "@/lib/types";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface RequestSummary {
  sourceIp: string;
  model: string | null;
  targetHost: string | null;
  count: number;
  avgDuration: number | null;
}

interface RequestLog {
  id: number;
  sourceIp: string;
  model: string | null;
  endpoint: string;
  method: string;
  targetHost: string | null;
  statusCode: number | null;
  durationMs: number | null;
  createdAt: string;
}

interface RequestsData {
  requests: RequestLog[];
  summary: RequestSummary[];
}

interface UsageRecord {
  serverName: string;
  serverId: number;
  modelName: string;
  totalLoadedSeconds: number;
  loadCount: number;
  lastSeen: string;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const TIME_RANGES = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
];

export default function HistoryPage() {
  const [hours, setHours] = useState(168);

  const { data: usage } = useSWR<UsageRecord[]>(
    `/api/usage?hours=${hours}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: events } = useSWR<ModelEvent[]>(
    `/api/events?hours=${hours}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: requestsData } = useSWR<RequestsData>(
    `/api/requests?hours=${hours}`,
    fetcher,
    { refreshInterval: 15000 }
  );

  // Group usage by server
  const serverGroups = new Map<string, UsageRecord[]>();
  for (const record of usage ?? []) {
    const existing = serverGroups.get(record.serverName) ?? [];
    existing.push(record);
    serverGroups.set(record.serverName, existing);
  }

  return (
    <div id="main-content" className="max-w-[1440px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">
          Usage History
        </h1>
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

      {/* Usage Summary Per Server */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          Model Usage by Server
        </h2>
        {serverGroups.size === 0 ? (
          <div className="bg-surface-raised border border-border rounded-xl p-6 text-center text-text-muted">
            No usage data in this time range
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...serverGroups.entries()].map(([serverName, records]) => (
              <div
                key={serverName}
                className="bg-surface-raised border border-border rounded-xl overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="font-semibold text-text-primary">
                    {serverName}
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    {records.length} model{records.length !== 1 ? "s" : ""} used
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-text-muted uppercase tracking-wide">
                      <th className="text-left p-3 pl-4">Model</th>
                      <th className="text-right p-3">Loads</th>
                      <th className="text-right p-3 pr-4">Total Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records
                      .sort((a, b) => b.totalLoadedSeconds - a.totalLoadedSeconds)
                      .map((record) => (
                        <tr
                          key={record.modelName}
                          className="border-t border-border/50"
                        >
                          <td className="p-3 pl-4 font-mono text-text-primary truncate max-w-[200px]">
                            {record.modelName}
                          </td>
                          <td className="p-3 text-right text-text-secondary">
                            {record.loadCount}
                          </td>
                          <td className="p-3 pr-4 text-right text-text-secondary font-mono">
                            {formatDuration(record.totalLoadedSeconds)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Request Log Summary (from proxy) */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          Proxy Requests by Source IP
        </h2>
        {!requestsData?.summary || requestsData.summary.length === 0 ? (
          <div className="bg-surface-raised border border-border rounded-xl p-6 text-center text-text-muted">
            No proxy requests yet. Services will appear here once they send requests through the proxy on port 11434.
          </div>
        ) : (
          <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wide">
                  <th className="text-left p-3 pl-4">Source IP</th>
                  <th className="text-left p-3">Model</th>
                  <th className="text-left p-3">Routed To</th>
                  <th className="text-right p-3">Requests</th>
                  <th className="text-right p-3 pr-4">Avg Latency</th>
                </tr>
              </thead>
              <tbody>
                {requestsData.summary.map((row, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="p-3 pl-4 font-mono text-text-primary">
                      {row.sourceIp}
                    </td>
                    <td className="p-3 font-mono text-text-secondary">
                      {row.model ?? "-"}
                    </td>
                    <td className="p-3 text-text-secondary font-mono text-xs">
                      {row.targetHost ?? "-"}
                    </td>
                    <td className="p-3 text-right text-text-primary font-semibold">
                      {row.count}
                    </td>
                    <td className="p-3 pr-4 text-right text-text-secondary font-mono">
                      {row.avgDuration != null ? `${row.avgDuration}ms` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent Proxy Requests */}
      {requestsData?.requests && requestsData.requests.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            Recent Proxy Requests ({requestsData.requests.length})
          </h2>
          <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-raised">
                  <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wide">
                    <th className="text-left p-3 pl-4">Time</th>
                    <th className="text-left p-3">Source</th>
                    <th className="text-left p-3">Endpoint</th>
                    <th className="text-left p-3">Model</th>
                    <th className="text-left p-3">Routed To</th>
                    <th className="text-right p-3">Status</th>
                    <th className="text-right p-3 pr-4">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {requestsData.requests.map((req) => (
                    <tr
                      key={req.id}
                      className="border-t border-border/50 hover:bg-surface-overlay/30"
                    >
                      <td className="p-3 pl-4 text-text-secondary whitespace-nowrap font-mono text-xs">
                        {formatTimestamp(req.createdAt)}
                      </td>
                      <td className="p-3 font-mono text-text-primary text-xs">
                        {req.sourceIp}
                      </td>
                      <td className="p-3 text-text-secondary font-mono text-xs">
                        {req.method} {req.endpoint}
                      </td>
                      <td className="p-3 font-mono text-text-secondary text-xs">
                        {req.model ?? "-"}
                      </td>
                      <td className="p-3 text-text-secondary font-mono text-xs">
                        {req.targetHost ?? "-"}
                      </td>
                      <td className="p-3 text-right">
                        <span
                          className={`text-xs font-mono ${
                            req.statusCode && req.statusCode < 400
                              ? "text-success"
                              : "text-danger"
                          }`}
                        >
                          {req.statusCode ?? "-"}
                        </span>
                      </td>
                      <td className="p-3 pr-4 text-right text-text-secondary font-mono text-xs">
                        {req.durationMs != null ? `${req.durationMs}ms` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Event Log */}
      <section>
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          Event Log ({events?.length ?? 0} events)
        </h2>
        <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
          {!events || events.length === 0 ? (
            <div className="p-6 text-center text-text-muted">
              No events in this time range
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-raised">
                  <tr className="text-xs text-text-muted uppercase tracking-wide border-b border-border">
                    <th className="text-left p-3 pl-4">Time</th>
                    <th className="text-left p-3">Server</th>
                    <th className="text-left p-3">Model</th>
                    <th className="text-left p-3 pr-4">Event</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr
                      key={event.id}
                      className="border-t border-border/50 hover:bg-surface-overlay/30"
                    >
                      <td className="p-3 pl-4 text-text-secondary whitespace-nowrap font-mono text-xs">
                        {formatTimestamp(event.occurredAt)}
                      </td>
                      <td className="p-3 text-text-secondary">
                        {event.serverName}
                      </td>
                      <td className="p-3 font-mono text-text-primary">
                        {event.modelName}
                      </td>
                      <td className="p-3 pr-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            event.eventType === "loaded"
                              ? "bg-success/15 text-success"
                              : "bg-danger/15 text-danger"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              event.eventType === "loaded"
                                ? "bg-success"
                                : "bg-danger"
                            }`}
                            aria-hidden="true"
                          />
                          {event.eventType}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
