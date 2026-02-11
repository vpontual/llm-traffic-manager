"use client";

import type { ModelEvent } from "@/lib/types";

// Assign consistent colors to model names
const MODEL_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

function getModelColor(name: string, colorMap: Map<string, string>): string {
  if (!colorMap.has(name)) {
    colorMap.set(name, MODEL_COLORS[colorMap.size % MODEL_COLORS.length]);
  }
  return colorMap.get(name)!;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface TimelineSegment {
  modelName: string;
  startPct: number;
  widthPct: number;
  color: string;
}

export function TimelineChart({
  events,
  servers,
  hours,
}: {
  events: ModelEvent[];
  servers: { id: number; name: string }[];
  hours: number;
}) {
  const now = Date.now();
  const rangeMs = hours * 60 * 60 * 1000;
  const startTime = now - rangeMs;
  const colorMap = new Map<string, string>();

  // Build timeline segments per server
  const serverTimelines = new Map<number, TimelineSegment[]>();

  for (const server of servers) {
    const serverEvents = events
      .filter((e) => e.serverId === server.id)
      .sort(
        (a, b) =>
          new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
      );

    const segments: TimelineSegment[] = [];
    // Track currently loaded models and when they were loaded
    const loadedAt = new Map<string, number>();

    for (const event of serverEvents) {
      const eventTime = new Date(event.occurredAt).getTime();

      if (event.eventType === "loaded") {
        loadedAt.set(event.modelName, eventTime);
      } else if (event.eventType === "unloaded") {
        const start = loadedAt.get(event.modelName);
        if (start !== undefined) {
          const startPct = Math.max(
            0,
            ((start - startTime) / rangeMs) * 100
          );
          const endPct = Math.min(
            100,
            ((eventTime - startTime) / rangeMs) * 100
          );
          segments.push({
            modelName: event.modelName,
            startPct,
            widthPct: endPct - startPct,
            color: getModelColor(event.modelName, colorMap),
          });
          loadedAt.delete(event.modelName);
        }
      }
    }

    // Models still loaded — extend to now
    for (const [modelName, start] of loadedAt) {
      const startPct = Math.max(0, ((start - startTime) / rangeMs) * 100);
      segments.push({
        modelName,
        startPct,
        widthPct: 100 - startPct,
        color: getModelColor(modelName, colorMap),
      });
    }

    serverTimelines.set(server.id, segments);
  }

  // Time axis labels
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const t = startTime + (rangeMs / (tickCount - 1)) * i;
    return formatTime(new Date(t));
  });

  // Unique model names for legend
  const allModelNames = [...colorMap.keys()];

  return (
    <div className="bg-surface-raised border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4 uppercase tracking-wide">
        Model Timeline (last {hours}h)
      </h3>

      {allModelNames.length === 0 ? (
        <p className="text-sm text-text-muted italic">
          No model events recorded yet
        </p>
      ) : (
        <>
          {/* Timeline rows */}
          <div className="space-y-3 mb-3">
            {servers.map((server) => {
              const segments = serverTimelines.get(server.id) ?? [];
              return (
                <div key={server.id} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-28 shrink-0 truncate">
                    {server.name}
                  </span>
                  <div className="flex-1 h-7 bg-surface-overlay rounded relative overflow-hidden">
                    {segments.map((seg, i) => (
                      <div
                        key={`${seg.modelName}-${i}`}
                        className="absolute top-0 h-full rounded opacity-80 hover:opacity-100 transition-opacity"
                        style={{
                          left: `${seg.startPct}%`,
                          width: `${Math.max(seg.widthPct, 0.5)}%`,
                          backgroundColor: seg.color,
                        }}
                        title={seg.modelName}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time axis */}
          <div className="flex justify-between ml-[7.75rem] text-xs text-text-muted">
            {ticks.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 ml-[7.75rem]">
            {allModelNames.map((name) => (
              <div key={name} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: colorMap.get(name) }}
                />
                <span className="text-xs text-text-secondary font-mono">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
