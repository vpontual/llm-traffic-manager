// Cron scheduling utilities -- parsing, conflict detection, slot finding

import CronExpressionParser from "cron-parser";
import type { ConflictGroup } from "./types";

export interface CronExecution {
  start: Date;
  end: Date;
}

export interface JobForConflictDetection {
  id: number;
  name: string;
  cronExpression: string;
  timezone: string;
  targetModel: string;
  expectedDurationMs: number;
}

/**
 * Get next N executions of a cron expression
 */
export function getNextExecutions(
  cronExpression: string,
  count: number,
  durationMs: number,
  timezone: string = "UTC",
  startFrom: Date = new Date()
): CronExecution[] {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: startFrom,
      tz: timezone,
    });

    const executions: CronExecution[] = [];
    for (let i = 0; i < count; i++) {
      const next = interval.next();
      const start = next.toDate();
      executions.push({
        start,
        end: new Date(start.getTime() + durationMs),
      });
    }
    return executions;
  } catch {
    return [];
  }
}

/**
 * Check if two time ranges overlap
 */
export function rangesOverlap(a: CronExecution, b: CronExecution): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Check if two executions are within the conflict window (5 minutes)
 */
export function withinConflictWindow(
  a: CronExecution,
  b: CronExecution,
  windowMs: number = 5 * 60 * 1000
): boolean {
  const aStart = a.start.getTime();
  const bStart = b.start.getTime();
  return Math.abs(aStart - bStart) < windowMs;
}

/**
 * Detect conflicts between scheduled jobs
 */
export function detectConflicts(
  jobs: JobForConflictDetection[],
  windowHours: number
): ConflictGroup[] {
  const conflicts: ConflictGroup[] = [];
  const windowMs = windowHours * 60 * 60 * 1000;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMs);

  // Generate all executions for all jobs within the window
  const allExecutions: Array<{
    job: JobForConflictDetection;
    execution: CronExecution;
  }> = [];

  for (const job of jobs) {
    const executions = getNextExecutions(
      job.cronExpression,
      Math.ceil(windowHours * 12), // Max ~12 executions per hour
      job.expectedDurationMs,
      job.timezone,
      now
    );

    for (const execution of executions) {
      if (execution.start <= windowEnd) {
        allExecutions.push({ job, execution });
      }
    }
  }

  // Sort by start time
  allExecutions.sort(
    (a, b) => a.execution.start.getTime() - b.execution.start.getTime()
  );

  // Find conflicts using sliding window
  const conflictWindowMs = 5 * 60 * 1000; // 5 minutes
  const processedPairs = new Set<string>();

  for (let i = 0; i < allExecutions.length; i++) {
    const current = allExecutions[i];

    for (let j = i + 1; j < allExecutions.length; j++) {
      const other = allExecutions[j];

      // Stop checking if we're past the conflict window
      if (
        other.execution.start.getTime() - current.execution.end.getTime() >
        conflictWindowMs
      ) {
        break;
      }

      // Skip if same job
      if (current.job.id === other.job.id) continue;

      // Create unique pair key to avoid duplicates
      const pairKey = [
        Math.min(current.job.id, other.job.id),
        Math.max(current.job.id, other.job.id),
        current.execution.start.toISOString(),
        other.execution.start.toISOString(),
      ].join("-");

      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      // Check for same model overlap (high priority)
      if (
        current.job.targetModel === other.job.targetModel &&
        rangesOverlap(current.execution, other.execution)
      ) {
        conflicts.push({
          startTime: new Date(
            Math.min(
              current.execution.start.getTime(),
              other.execution.start.getTime()
            )
          ).toISOString(),
          endTime: new Date(
            Math.max(
              current.execution.end.getTime(),
              other.execution.end.getTime()
            )
          ).toISOString(),
          jobs: [
            {
              jobId: current.job.id,
              jobName: current.job.name,
              targetModel: current.job.targetModel,
            },
            {
              jobId: other.job.id,
              jobName: other.job.name,
              targetModel: other.job.targetModel,
            },
          ],
          conflictType: "same_model",
        });
      }
      // Check for time window overlap (medium priority)
      else if (withinConflictWindow(current.execution, other.execution)) {
        conflicts.push({
          startTime: new Date(
            Math.min(
              current.execution.start.getTime(),
              other.execution.start.getTime()
            )
          ).toISOString(),
          endTime: new Date(
            Math.max(
              current.execution.end.getTime(),
              other.execution.end.getTime()
            )
          ).toISOString(),
          jobs: [
            {
              jobId: current.job.id,
              jobName: current.job.name,
              targetModel: current.job.targetModel,
            },
            {
              jobId: other.job.id,
              jobName: other.job.name,
              targetModel: other.job.targetModel,
            },
          ],
          conflictType: "time_overlap",
        });
      }
    }
  }

  return conflicts;
}

/**
 * Validate a cron expression
 */
export function isValidCron(expression: string): boolean {
  try {
    CronExpressionParser.parse(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Human-readable description of cron expression
 */
export function describeCron(expression: string): string {
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5) return "Invalid cron expression";

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Common patterns
    if (minute === "*" && hour === "*") {
      return "Every minute";
    }
    if (minute === "0" && hour === "*") {
      return "Every hour";
    }
    if (minute === "0" && hour === "0") {
      return "Daily at midnight";
    }
    if (hour.startsWith("*/")) {
      const interval = hour.slice(2);
      return `Every ${interval} hours`;
    }
    if (minute.startsWith("*/")) {
      const interval = minute.slice(2);
      return `Every ${interval} minutes`;
    }
    if (dayOfWeek === "0" && minute === "0" && hour === "0") {
      return "Weekly on Sunday at midnight";
    }
    if (dayOfMonth === "1" && minute === "0" && hour === "0") {
      return "Monthly on the 1st at midnight";
    }
    if (minute !== "*" && hour !== "*" && dayOfMonth === "*" && month === "*") {
      return `Daily at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    }

    // Default: show next execution time
    const next = CronExpressionParser.parse(expression).next().toDate();
    return `Next: ${next.toLocaleString()}`;
  } catch {
    return "Invalid cron expression";
  }
}

/**
 * Find open time slots for a new job
 */
export function findOpenSlots(
  existingJobs: JobForConflictDetection[],
  targetModel: string,
  durationMs: number,
  windowHours: number,
  slotIntervalMinutes: number = 30
): Array<{ startTime: Date; endTime: Date }> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
  const conflictWindowMs = 5 * 60 * 1000;

  // Get all existing executions
  const existingExecutions: CronExecution[] = [];
  for (const job of existingJobs) {
    const executions = getNextExecutions(
      job.cronExpression,
      Math.ceil(windowHours * 12),
      job.expectedDurationMs,
      job.timezone,
      now
    );
    existingExecutions.push(
      ...executions.filter((e) => e.start <= windowEnd)
    );
  }

  // Generate candidate slots
  const slots: Array<{ startTime: Date; endTime: Date }> = [];
  const slotIntervalMs = slotIntervalMinutes * 60 * 1000;

  for (
    let time = now.getTime();
    time < windowEnd.getTime();
    time += slotIntervalMs
  ) {
    const candidateStart = new Date(time);
    const candidateEnd = new Date(time + durationMs);

    // Check if this slot conflicts with any existing execution
    const hasConflict = existingExecutions.some((existing) => {
      // Check same model overlap
      const sameModelJob = existingJobs.find(
        (j) =>
          j.targetModel === targetModel &&
          getNextExecutions(j.cronExpression, 1, j.expectedDurationMs, j.timezone, now).some(
            (e) => e.start.getTime() === existing.start.getTime()
          )
      );

      if (sameModelJob) {
        return rangesOverlap(
          { start: candidateStart, end: candidateEnd },
          existing
        );
      }

      // Check time window overlap
      return withinConflictWindow(
        { start: candidateStart, end: candidateEnd },
        existing,
        conflictWindowMs
      );
    });

    if (!hasConflict) {
      slots.push({ startTime: candidateStart, endTime: candidateEnd });
    }
  }

  // Return up to 10 slots
  return slots.slice(0, 10);
}
