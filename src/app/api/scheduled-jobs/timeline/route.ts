// GET /api/scheduled-jobs/timeline -- predicted execution timeline with conflicts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledJobs } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getNextExecutions, detectConflicts } from "@/lib/cron-utils";
import type { ScheduledExecution, ConflictGroup } from "@/lib/types";
import { getHoursWindow } from "@/lib/api/time-window";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const { hours } = getHoursWindow(searchParams, 24, 168);

  const now = new Date();
  const windowEnd = new Date(now.getTime() + hours * 60 * 60 * 1000);

  // Get all enabled jobs
  const jobs = await db
    .select()
    .from(scheduledJobs)
    .where(eq(scheduledJobs.isEnabled, true));

  // Generate executions for each job
  const executions: ScheduledExecution[] = [];

  for (const job of jobs) {
    const nextExecs = getNextExecutions(
      job.cronExpression,
      Math.ceil(hours * 12), // Max ~12 per hour
      job.expectedDurationMs,
      job.timezone,
      now
    );

    for (const exec of nextExecs) {
      if (exec.start <= windowEnd) {
        executions.push({
          jobId: job.id,
          jobName: job.name,
          sourceIdentifier: job.sourceIdentifier,
          targetModel: job.targetModel,
          startTime: exec.start.toISOString(),
          endTime: exec.end.toISOString(),
          isConflict: false, // Will be updated below
        });
      }
    }
  }

  // Sort by start time
  executions.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  // Detect conflicts
  const jobsForConflict = jobs.map((j) => ({
    id: j.id,
    name: j.name,
    cronExpression: j.cronExpression,
    timezone: j.timezone,
    targetModel: j.targetModel,
    expectedDurationMs: j.expectedDurationMs,
  }));

  const conflicts = detectConflicts(jobsForConflict, hours);

  // Mark conflicting executions
  const conflictJobIds = new Set<number>();
  for (const conflict of conflicts) {
    for (const job of conflict.jobs) {
      conflictJobIds.add(job.jobId);
    }
  }

  for (const exec of executions) {
    if (conflictJobIds.has(exec.jobId)) {
      // Check if this specific execution time is in a conflict
      const execStart = new Date(exec.startTime).getTime();
      const execEnd = new Date(exec.endTime).getTime();

      exec.isConflict = conflicts.some((c) => {
        const conflictStart = new Date(c.startTime).getTime();
        const conflictEnd = new Date(c.endTime).getTime();
        return (
          c.jobs.some((j) => j.jobId === exec.jobId) &&
          execStart < conflictEnd &&
          execEnd > conflictStart
        );
      });
    }
  }

  return NextResponse.json({
    executions,
    conflicts,
  });
}
