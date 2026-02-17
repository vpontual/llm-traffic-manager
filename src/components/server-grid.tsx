"use client";

import { useState } from "react";
import type { ServerState } from "@/lib/types";
import { ServerCard } from "./server-card";

export function ServerGrid({ servers }: { servers: ServerState[] }) {
  const [expanded, setExpanded] = useState(true);

  // Find the latest Ollama version across all online servers
  const versions = servers
    .filter((s) => s.isOnline && s.ollamaVersion)
    .map((s) => s.ollamaVersion!);
  const latestVersion =
    versions.length > 0
      ? versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)!
      : null;

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse all server details" : "Expand all server details"}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-surface-raised border border-border rounded-lg text-text-muted hover:text-text-secondary hover:border-accent transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {expanded ? "Collapse All" : "Expand All"}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {servers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            latestVersion={latestVersion}
            expanded={expanded}
          />
        ))}
      </div>
    </div>
  );
}
