"use client";

import type { ServerState } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "-";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

interface LoadedModel {
  name: string;
  serverName: string;
  vramSize: number;
  parameterSize: string;
  quantization: string;
  expiresAt: string;
}

export function ModelTable({ servers }: { servers: ServerState[] }) {
  const allModels: LoadedModel[] = [];

  for (const server of servers) {
    for (const model of server.loadedModels) {
      allModels.push({
        name: model.name,
        serverName: server.name,
        vramSize: model.size_vram ?? 0,
        parameterSize: model.details?.parameter_size ?? "-",
        quantization: model.details?.quantization_level ?? "-",
        expiresAt: model.expires_at ?? "",
      });
    }
  }

  if (allModels.length === 0) {
    return (
      <div className="bg-surface-raised border border-border rounded-xl p-6 text-center text-text-muted">
        No models currently loaded across the fleet
      </div>
    );
  }

  return (
    <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wide">
            <th className="text-left p-3 pl-4">Model</th>
            <th className="text-left p-3">Server</th>
            <th className="text-right p-3">VRAM</th>
            <th className="text-right p-3">Params</th>
            <th className="text-right p-3 pr-4">Quantization</th>
          </tr>
        </thead>
        <tbody>
          {allModels.map((model, i) => (
            <tr
              key={`${model.serverName}-${model.name}`}
              className={
                i < allModels.length - 1 ? "border-b border-border/50" : ""
              }
            >
              <td className="p-3 pl-4 font-mono text-text-primary">
                {model.name}
              </td>
              <td className="p-3 text-text-secondary">{model.serverName}</td>
              <td className="p-3 text-right text-text-secondary font-mono">
                {formatBytes(model.vramSize)}
              </td>
              <td className="p-3 text-right text-text-secondary">
                {model.parameterSize}
              </td>
              <td className="p-3 pr-4 text-right text-text-secondary">
                {model.quantization}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
