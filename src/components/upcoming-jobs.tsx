"use client";

import Link from "next/link";
import type { ScheduledExecution, ConflictGroup } from "@/lib/types";

function formatCountdown(isoDate: string): string {
  const ms = new Date(isoDate).getTime() - Date.now();
  if (ms < 0) return "now";

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UpcomingJobs({
  executions,
  conflicts = [],
}: {
  executions: ScheduledExecution[];
  conflicts?: ConflictGroup[];
}) {
  // Only count same_model conflicts for the dashboard
  const sameModelConflicts = conflicts.filter((c) => c.conflictType === "same_model");
  const sameModelJobIds = new Set(
    sameModelConflicts.flatMap((c) => c.jobs.map((j) => j.jobId))
  );

  // Show next 5 unique jobs
  const seen = new Set<number>();
  const upcoming = executions.filter((e) => {
    if (seen.has(e.jobId)) return false;
    seen.add(e.jobId);
    return true;
  }).slice(0, 5);

  if (upcoming.length === 0) {
    return (
      <div className="bg-surface-raised border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
            Upcoming Scheduled
          </h3>
          <Link
            href="/schedule"
            className="text-xs text-accent hover:underline"
          >
            Manage
          </Link>
        </div>
        <p className="text-sm text-text-muted italic">
          No scheduled jobs configured
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
            Upcoming Scheduled
          </h3>
          {sameModelConflicts.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-danger/20 text-danger rounded-full">
              {sameModelConflicts.length} model conflict{sameModelConflicts.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <Link href="/schedule" className="text-xs text-accent hover:underline">
          View All
        </Link>
      </div>

      <ul className="space-y-2">
        {upcoming.map((exec) => {
          const hasSameModelConflict = sameModelJobIds.has(exec.jobId);
          return (
            <li
              key={`${exec.jobId}-${exec.startTime}`}
              className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                hasSameModelConflict
                  ? "bg-danger/10 border border-danger/20"
                  : "bg-surface-overlay"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary truncate font-medium">
                  {exec.jobName}
                </p>
                <p className="text-xs text-text-muted truncate">
                  {exec.targetModel}
                </p>
              </div>
              <div className="text-right ml-3">
                <p
                  className={`text-sm font-medium ${
                    hasSameModelConflict ? "text-danger" : "text-accent"
                  }`}
                >
                  {formatCountdown(exec.startTime)}
                </p>
                <p className="text-xs text-text-muted">
                  {formatTime(exec.startTime)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
