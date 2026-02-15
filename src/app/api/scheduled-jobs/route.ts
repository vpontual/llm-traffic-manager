import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledJobs, servers } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import {
  isValidCron,
  detectConflicts,
} from "@/lib/cron-utils";
import type { ScheduledJob } from "@/lib/types";
import {
  getPreferredServerName,
  scheduledJobWithServerSelect,
  toConflictJobs,
  toScheduledJob,
  toScheduledJobWithServerName,
} from "@/lib/scheduled-jobs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const enabledOnly = searchParams.get("enabled") === "true";
  const modelFilter = searchParams.get("model");

  let query = db
    .select(scheduledJobWithServerSelect)
    .from(scheduledJobs)
    .leftJoin(servers, eq(scheduledJobs.preferredServerId, servers.id))
    .orderBy(desc(scheduledJobs.createdAt))
    .$dynamic();

  if (enabledOnly) {
    query = query.where(eq(scheduledJobs.isEnabled, true));
  }

  const rows = await query;

  // Filter by model if specified (done in JS since it's a simple filter)
  const filteredRows = modelFilter
    ? rows.filter((r) => r.targetModel === modelFilter)
    : rows;

  const jobs: ScheduledJob[] = filteredRows.map(toScheduledJob);

  return NextResponse.json(jobs);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      name,
      description,
      sourceIdentifier,
      cronExpression,
      timezone = "UTC",
      targetModel,
      preferredServerId,
      expectedDurationMs = 60000,
    } = body;

    // Validate required fields
    if (!name || !sourceIdentifier || !cronExpression || !targetModel) {
      return NextResponse.json(
        { error: "Missing required fields: name, sourceIdentifier, cronExpression, targetModel" },
        { status: 400 }
      );
    }

    // Validate cron expression
    if (!isValidCron(cronExpression)) {
      return NextResponse.json(
        { error: "Invalid cron expression" },
        { status: 400 }
      );
    }

    // Insert the job
    const [inserted] = await db
      .insert(scheduledJobs)
      .values({
        name,
        description: description || null,
        sourceIdentifier,
        cronExpression,
        timezone,
        targetModel,
        preferredServerId: preferredServerId || null,
        expectedDurationMs,
      })
      .returning();

    // Get existing jobs to check for conflicts
    const existingJobs = await db
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.isEnabled, true));

    const jobsForConflict = toConflictJobs(existingJobs);

    const conflicts = detectConflicts(jobsForConflict, 24);
    const relevantConflicts = conflicts.filter((c) =>
      c.jobs.some((j) => j.jobId === inserted.id)
    );

    const preferredServerName = await getPreferredServerName(inserted.preferredServerId);

    const response: ScheduledJob & { conflicts: typeof relevantConflicts } = {
      ...toScheduledJobWithServerName(inserted, preferredServerName),
      conflicts: relevantConflicts,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error creating scheduled job:", error);
    return NextResponse.json(
      { error: "Failed to create scheduled job" },
      { status: 500 }
    );
  }
}
