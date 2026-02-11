"use client";

import Link from "next/link";
import type { ConflictGroup } from "@/lib/types";

function formatDateTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UpcomingJobs({
  conflicts = [],
}: {
  conflicts?: ConflictGroup[];
}) {
  // Only show same_model conflicts on dashboard
  const sameModelConflicts = conflicts.filter((c) => c.conflictType === "same_model");

  if (sameModelConflicts.length === 0) {
    return null; // No conflicts to show
  }

  return (
    <div className="bg-danger/10 border border-danger/20 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-danger text-lg">!</span>
          <h4 className="text-sm font-semibold text-danger">
            Same Model Conflicts ({sameModelConflicts.length})
          </h4>
        </div>
        <Link href="/schedule" className="text-xs text-accent hover:underline">
          View Schedule
        </Link>
      </div>
      <p className="text-xs text-danger/80 mb-3">
        These jobs request the same model with overlapping execution windows,
        which may cause request queuing.
      </p>
      <ul className="space-y-2">
        {sameModelConflicts.map((conflict, i) => (
          <li
            key={i}
            className="text-sm text-text-primary bg-surface-raised rounded-lg p-2"
          >
            <div className="flex items-center gap-2 flex-wrap">
              {conflict.jobs.map((job) => (
                <span
                  key={job.jobId}
                  className="px-2 py-0.5 bg-danger/20 text-danger rounded text-xs"
                >
                  {job.jobName}
                </span>
              ))}
              <span className="text-xs text-text-muted">
                at {formatDateTime(conflict.startTime)}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Model: {conflict.jobs[0].targetModel}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
