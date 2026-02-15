import { getNextExecutions } from "@/lib/cron-utils";
import { db } from "@/lib/db";
import { scheduledJobs, servers } from "@/lib/schema";
import type { ScheduledJob } from "@/lib/types";
import { eq } from "drizzle-orm";

type ScheduledJobBaseRow = {
  id: number;
  name: string;
  description: string | null;
  sourceIdentifier: string;
  cronExpression: string;
  timezone: string;
  targetModel: string;
  preferredServerId: number | null;
  expectedDurationMs: number;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ScheduledJobRow = ScheduledJobBaseRow & {
  preferredServerName: string | null;
};

export const scheduledJobWithServerSelect = {
  id: scheduledJobs.id,
  name: scheduledJobs.name,
  description: scheduledJobs.description,
  sourceIdentifier: scheduledJobs.sourceIdentifier,
  cronExpression: scheduledJobs.cronExpression,
  timezone: scheduledJobs.timezone,
  targetModel: scheduledJobs.targetModel,
  preferredServerId: scheduledJobs.preferredServerId,
  expectedDurationMs: scheduledJobs.expectedDurationMs,
  isEnabled: scheduledJobs.isEnabled,
  createdAt: scheduledJobs.createdAt,
  updatedAt: scheduledJobs.updatedAt,
  preferredServerName: servers.name,
} as const;

export function toScheduledJob(row: ScheduledJobRow): ScheduledJob {
  const nextExecs = getNextExecutions(
    row.cronExpression,
    5,
    row.expectedDurationMs,
    row.timezone
  );

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sourceIdentifier: row.sourceIdentifier,
    cronExpression: row.cronExpression,
    timezone: row.timezone,
    targetModel: row.targetModel,
    preferredServerId: row.preferredServerId,
    preferredServerName: row.preferredServerName,
    expectedDurationMs: row.expectedDurationMs,
    isEnabled: row.isEnabled,
    nextExecutions: nextExecs.map((e) => e.start.toISOString()),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toScheduledJobWithServerName(
  row: ScheduledJobBaseRow,
  preferredServerName: string | null
): ScheduledJob {
  return toScheduledJob({
    ...row,
    preferredServerName,
  });
}

export async function getPreferredServerName(
  preferredServerId: number | null
): Promise<string | null> {
  if (!preferredServerId) {
    return null;
  }

  const [server] = await db
    .select({ name: servers.name })
    .from(servers)
    .where(eq(servers.id, preferredServerId))
    .limit(1);

  return server?.name ?? null;
}

export function toConflictJobs(
  jobs: Array<{
    id: number;
    name: string;
    cronExpression: string;
    timezone: string;
    targetModel: string;
    expectedDurationMs: number;
  }>
) {
  return jobs.map((job) => ({
    id: job.id,
    name: job.name,
    cronExpression: job.cronExpression,
    timezone: job.timezone,
    targetModel: job.targetModel,
    expectedDurationMs: job.expectedDurationMs,
  }));
}
