"use client";

import Link from "next/link";
import type { ScheduledExecution } from "@/lib/types";

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
  conflictCount = 0,
}: {
  executions: ScheduledExecution[];
  conflictCount?: number;
}) {
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
          {conflictCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-warning/20 text-warning rounded-full">
              {conflictCount} conflict{conflictCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <Link href="/schedule" className="text-xs text-accent hover:underline">
          View All
        </Link>
      </div>

      <ul className="space-y-2">
        {upcoming.map((exec) => (
          <li
            key={`${exec.jobId}-${exec.startTime}`}
            className={`flex items-center justify-between py-2 px-3 rounded-lg ${
              exec.isConflict
                ? "bg-warning/10 border border-warning/20"
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
                  exec.isConflict ? "text-warning" : "text-accent"
                }`}
              >
                {formatCountdown(exec.startTime)}
              </p>
              <p className="text-xs text-text-muted">
                {formatTime(exec.startTime)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
