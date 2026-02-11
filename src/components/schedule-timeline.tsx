"use client";

import type { ScheduledExecution, ConflictGroup } from "@/lib/types";

const JOB_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

function getJobColor(name: string, colorMap: Map<string, string>): string {
  if (!colorMap.has(name)) {
    colorMap.set(name, JOB_COLORS[colorMap.size % JOB_COLORS.length]);
  }
  return colorMap.get(name)!;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface TimelineSegment {
  jobId: number;
  jobName: string;
  targetModel: string;
  startPct: number;
  widthPct: number;
  color: string;
  isConflict: boolean;
  startTime: Date;
  endTime: Date;
}

export function ScheduleTimeline({
  executions,
  conflicts,
  hours,
  onJobClick,
}: {
  executions: ScheduledExecution[];
  conflicts: ConflictGroup[];
  hours: number;
  onJobClick?: (jobId: number) => void;
}) {
  const now = Date.now();
  const rangeMs = hours * 60 * 60 * 1000;
  const endTime = now + rangeMs;
  const colorMap = new Map<string, string>();

  // Build segments from executions
  const segments: TimelineSegment[] = executions.map((exec) => {
    const startMs = new Date(exec.startTime).getTime();
    const endMs = new Date(exec.endTime).getTime();

    const startPct = Math.max(0, ((startMs - now) / rangeMs) * 100);
    const endPct = Math.min(100, ((endMs - now) / rangeMs) * 100);

    return {
      jobId: exec.jobId,
      jobName: exec.jobName,
      targetModel: exec.targetModel,
      startPct,
      widthPct: Math.max(endPct - startPct, 1), // Minimum 1% width for visibility
      color: getJobColor(exec.jobName, colorMap),
      isConflict: exec.isConflict,
      startTime: new Date(exec.startTime),
      endTime: new Date(exec.endTime),
    };
  });

  // Time axis labels
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const t = now + (rangeMs / (tickCount - 1)) * i;
    return formatTime(new Date(t));
  });

  // Group by job for multi-row display
  const jobNames = [...new Set(executions.map((e) => e.jobName))];

  // Calculate "now" position (always at 0%)
  const nowPct = 0;

  return (
    <div className="bg-surface-raised border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
          Scheduled Jobs (next {hours}h)
        </h3>
        {conflicts.length > 0 && (
          <span className="text-xs px-2 py-1 bg-warning/20 text-warning rounded-full">
            {conflicts.length} conflict{conflicts.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {segments.length === 0 ? (
        <p className="text-sm text-text-muted italic">
          No scheduled jobs in this time window
        </p>
      ) : (
        <>
          {/* Timeline view - single row with all jobs */}
          <div className="mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-secondary w-48 shrink-0">
                All Jobs
              </span>
              <div className="flex-1 h-10 bg-surface-overlay rounded relative overflow-hidden">
                {/* Now marker */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-accent z-10"
                  style={{ left: `${nowPct}%` }}
                  title="Now"
                />

                {/* Execution segments */}
                {segments.map((seg, i) => (
                  <div
                    key={`${seg.jobId}-${i}`}
                    className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all hover:opacity-100 ${
                      seg.isConflict
                        ? "opacity-90 ring-2 ring-warning"
                        : "opacity-70 hover:ring-2 hover:ring-accent"
                    }`}
                    style={{
                      left: `${seg.startPct}%`,
                      width: `${seg.widthPct}%`,
                      backgroundColor: seg.color,
                      minWidth: "8px",
                    }}
                    title={`${seg.jobName}\n${seg.targetModel}\n${formatDateTime(seg.startTime)} - ${formatDateTime(seg.endTime)}`}
                    onClick={() => onJobClick?.(seg.jobId)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Per-job rows */}
          <div className="space-y-2 mb-3">
            {jobNames.map((jobName) => {
              const jobSegments = segments.filter((s) => s.jobName === jobName);
              return (
                <div key={jobName} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-48 shrink-0 truncate" title={jobName}>
                    {jobName}
                  </span>
                  <div className="flex-1 h-6 bg-surface-overlay rounded relative overflow-hidden">
                    {jobSegments.map((seg, i) => (
                      <div
                        key={`${seg.jobId}-${i}`}
                        className={`absolute top-0.5 bottom-0.5 rounded cursor-pointer transition-all hover:opacity-100 ${
                          seg.isConflict
                            ? "opacity-90 ring-2 ring-warning"
                            : "opacity-70"
                        }`}
                        style={{
                          left: `${seg.startPct}%`,
                          width: `${seg.widthPct}%`,
                          backgroundColor: seg.color,
                          minWidth: "4px",
                        }}
                        title={`${formatDateTime(seg.startTime)}`}
                        onClick={() => onJobClick?.(seg.jobId)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time axis */}
          <div className="flex justify-between ml-[12.75rem] text-xs text-text-muted">
            {ticks.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 ml-[12.75rem]">
            {jobNames.map((name) => (
              <div key={name} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: colorMap.get(name) }}
                />
                <span className="text-xs text-text-secondary">
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
