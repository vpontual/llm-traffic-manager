"use client";

import type { ScheduledJob } from "@/lib/types";
import { describeCron } from "@/lib/cron-utils";

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
  const hrs = hours % 24;
  return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
}

function formatDateTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function JobCard({
  job,
  onEdit,
  onToggle,
  onDelete,
}: {
  job: ScheduledJob;
  onEdit?: (job: ScheduledJob) => void;
  onToggle?: (job: ScheduledJob) => void;
  onDelete?: (job: ScheduledJob) => void;
}) {
  const nextExec = job.nextExecutions[0];
  const cronDescription = describeCron(job.cronExpression);

  return (
    <div
      className={`bg-surface-raised border rounded-xl p-5 ${
        job.isEnabled ? "border-border" : "border-border opacity-60"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-text-primary truncate">
            {job.name}
          </h3>
          <p className="text-sm text-text-muted truncate">
            {job.sourceIdentifier}
          </p>
        </div>
        <button
          onClick={() => onToggle?.(job)}
          className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
            job.isEnabled
              ? "bg-success/20 text-success hover:bg-success/30"
              : "bg-surface-overlay text-text-muted hover:bg-surface-overlay/80"
          }`}
        >
          {job.isEnabled ? "Enabled" : "Disabled"}
        </button>
      </div>

      {/* Description */}
      {job.description && (
        <p className="text-sm text-text-secondary mb-3 line-clamp-2">
          {job.description}
        </p>
      )}

      {/* Info grid */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Model</span>
          <span className="text-text-primary font-mono truncate ml-2">
            {job.targetModel}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Schedule</span>
          <span className="text-text-primary font-mono text-xs">
            {job.cronExpression}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Frequency</span>
          <span className="text-text-muted">{cronDescription}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Duration</span>
          <span className="text-text-muted">
            ~{formatDuration(job.expectedDurationMs)}
          </span>
        </div>
        {job.preferredServerName && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Preferred Server</span>
            <span className="text-text-muted">{job.preferredServerName}</span>
          </div>
        )}
      </div>

      {/* Next execution */}
      {nextExec && job.isEnabled && (
        <div className="bg-surface-overlay rounded-lg px-3 py-2 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted uppercase tracking-wide">
              Next Run
            </span>
            <span className="text-sm font-medium text-accent">
              in {formatCountdown(nextExec)}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            {formatDateTime(nextExec)}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onEdit?.(job)}
          className="flex-1 px-3 py-1.5 text-sm bg-surface-overlay border border-border rounded-lg hover:bg-surface-overlay/80 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete?.(job)}
          className="px-3 py-1.5 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg hover:bg-danger/20 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
