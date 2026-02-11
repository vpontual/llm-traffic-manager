"use client";

import type { ServerState } from "@/lib/types";
import { ServerCard } from "./server-card";

export function ServerGrid({ servers }: { servers: ServerState[] }) {
  // Find the latest Ollama version across all online servers
  const versions = servers
    .filter((s) => s.isOnline && s.ollamaVersion)
    .map((s) => s.ollamaVersion!);
  const latestVersion =
    versions.length > 0
      ? versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)!
      : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {servers.map((server) => (
        <ServerCard
          key={server.id}
          server={server}
          latestVersion={latestVersion}
        />
      ))}
    </div>
  );
}
