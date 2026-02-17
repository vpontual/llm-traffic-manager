"use client";

import type { ServerEvent } from "@/lib/types";

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

function eventBadge(eventType: string) {
  switch (eventType) {
    case "online":
      return {
        bg: "bg-success/15",
        text: "text-success",
        dot: "bg-success",
        label: "online",
      };
    case "offline":
      return {
        bg: "bg-danger/15",
        text: "text-danger",
        dot: "bg-danger",
        label: "offline",
      };
    case "reboot":
      return {
        bg: "bg-warning/15",
        text: "text-warning",
        dot: "bg-warning",
        label: "reboot",
      };
    default:
      return {
        bg: "bg-text-muted/15",
        text: "text-text-muted",
        dot: "bg-text-muted",
        label: eventType,
      };
  }
}

export function ServerActivity({ events }: { events: ServerEvent[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
        Server Activity
      </h2>
      <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-raised">
              <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wide">
                <th className="text-left p-3 pl-4">Time</th>
                <th className="text-left p-3">Server</th>
                <th className="text-left p-3">Event</th>
                <th className="text-left p-3 pr-4">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const badge = eventBadge(event.eventType);
                return (
                  <tr
                    key={event.id}
                    className="border-t border-border/50 hover:bg-surface-overlay/30"
                  >
                    <td className="p-3 pl-4 text-text-secondary whitespace-nowrap font-mono text-xs">
                      {formatTimestamp(event.occurredAt)}
                    </td>
                    <td className="p-3 text-text-primary text-xs">
                      {event.serverName}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}
                          aria-hidden="true"
                        />
                        {badge.label}
                      </span>
                    </td>
                    <td className="p-3 pr-4 text-text-secondary font-mono text-xs">
                      {event.detail ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
