"use client";

import type { ConflictGroup } from "@/lib/types";

function formatDateTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConflictAlert({
  conflicts,
  onJobClick,
}: {
  conflicts: ConflictGroup[];
  onJobClick?: (jobId: number) => void;
}) {
  if (conflicts.length === 0) return null;

  const sameModelConflicts = conflicts.filter(
    (c) => c.conflictType === "same_model"
  );
  const timeOverlapConflicts = conflicts.filter(
    (c) => c.conflictType === "time_overlap"
  );

  return (
    <div className="space-y-3">
      {sameModelConflicts.length > 0 && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-danger text-lg">!</span>
            <h4 className="text-sm font-semibold text-danger">
              Same Model Conflicts ({sameModelConflicts.length})
            </h4>
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
                  {conflict.jobs.map((job, j) => (
                    <button
                      key={job.jobId}
                      onClick={() => onJobClick?.(job.jobId)}
                      className="px-2 py-0.5 bg-danger/20 text-danger rounded text-xs hover:bg-danger/30 transition-colors"
                    >
                      {job.jobName}
                    </button>
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
      )}

      {timeOverlapConflicts.length > 0 && (
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-warning text-lg">!</span>
            <h4 className="text-sm font-semibold text-warning">
              Time Window Overlaps ({timeOverlapConflicts.length})
            </h4>
          </div>
          <p className="text-xs text-warning/80 mb-3">
            These jobs start within 5 minutes of each other, which may cause
            increased fleet load.
          </p>
          <ul className="space-y-2">
            {timeOverlapConflicts.slice(0, 5).map((conflict, i) => (
              <li
                key={i}
                className="text-sm text-text-primary bg-surface-raised rounded-lg p-2"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {conflict.jobs.map((job) => (
                    <button
                      key={job.jobId}
                      onClick={() => onJobClick?.(job.jobId)}
                      className="px-2 py-0.5 bg-warning/20 text-warning rounded text-xs hover:bg-warning/30 transition-colors"
                    >
                      {job.jobName}
                    </button>
                  ))}
                  <span className="text-xs text-text-muted">
                    at {formatDateTime(conflict.startTime)}
                  </span>
                </div>
              </li>
            ))}
            {timeOverlapConflicts.length > 5 && (
              <li className="text-xs text-text-muted">
                ...and {timeOverlapConflicts.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
