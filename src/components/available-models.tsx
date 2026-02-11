"use client";

import { useState } from "react";
import useSWR from "swr";
import type { ServerState, OllamaAvailableModel } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

interface RequestSummary {
  sourceIp: string;
  model: string | null;
  targetHost: string | null;
  count: number;
}

export function AvailableModels({ servers }: { servers: ServerState[] }) {
  const [activeTab, setActiveTab] = useState(0);

  // Fetch request counts to sort by usage
  const { data: requestsData } = useSWR<{ summary: RequestSummary[] }>(
    "/api/requests?hours=720",
    fetcher,
    { refreshInterval: 30000 }
  );

  if (servers.length === 0) {
    return (
      <div className="bg-surface-raised border border-border rounded-xl p-6 text-center text-text-muted">
        No servers found
      </div>
    );
  }

  // Build request count map keyed by "targetHost:model" — only counts requests actually routed to that server
  const modelRequestCounts = new Map<string, number>();
  if (requestsData?.summary) {
    for (const row of requestsData.summary) {
      if (row.model && row.targetHost) {
        const key = `${row.targetHost}:${row.model}`;
        modelRequestCounts.set(key, (modelRequestCounts.get(key) ?? 0) + row.count);
      }
    }
  }

  const activeServer = servers[activeTab];

  // Sort: models with requests first (by count desc), then unused models alphabetically
  const models = [...activeServer.availableModels].sort(
    (a: OllamaAvailableModel, b: OllamaAvailableModel) => {
      const countA =
        modelRequestCounts.get(`${activeServer.host}:${a.name}`) ?? 0;
      const countB =
        modelRequestCounts.get(`${activeServer.host}:${b.name}`) ?? 0;
      if (countA !== countB) return countB - countA;
      return a.name.localeCompare(b.name);
    }
  );

  function getRequestCount(model: OllamaAvailableModel): number {
    return modelRequestCounts.get(`${activeServer.host}:${model.name}`) ?? 0;
  }

  return (
    <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border">
        {servers.map((server, i) => (
          <button
            key={server.id}
            onClick={() => setActiveTab(i)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === i
                ? "text-accent border-b-2 border-accent bg-surface-overlay/30"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {server.name}
            <span className="ml-2 text-xs opacity-70">
              ({server.availableModels.length})
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      {models.length === 0 ? (
        <div className="p-6 text-center text-text-muted">
          No models on this server
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-raised">
              <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wide">
                <th className="text-left p-3 pl-4">Model</th>
                <th className="text-left p-3">Family</th>
                <th className="text-right p-3">Size</th>
                <th className="text-right p-3">Params</th>
                <th className="text-right p-3">Quant</th>
                <th className="text-right p-3 pr-4">Requests</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => {
                const count = getRequestCount(model);
                return (
                  <tr
                    key={model.name}
                    className="border-t border-border/50 hover:bg-surface-overlay/30"
                  >
                    <td className="p-3 pl-4 font-mono text-text-primary">
                      {model.name}
                    </td>
                    <td className="p-3 text-text-secondary">
                      {model.details?.family ?? "-"}
                    </td>
                    <td className="p-3 text-right text-text-secondary font-mono">
                      {formatSize(model.size)}
                    </td>
                    <td className="p-3 text-right text-text-secondary">
                      {model.details?.parameter_size ?? "-"}
                    </td>
                    <td className="p-3 text-right text-text-secondary">
                      {model.details?.quantization_level ?? "-"}
                    </td>
                    <td className="p-3 pr-4 text-right font-mono">
                      {count > 0 ? (
                        <span className="text-accent">{count}</span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
