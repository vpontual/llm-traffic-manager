import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledJobs, servers } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import {
  getNextExecutions,
  isValidCron,
  detectConflicts,
} from "@/lib/cron-utils";
import type { ScheduledJob } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const enabledOnly = searchParams.get("enabled") === "true";
  const modelFilter = searchParams.get("model");

  let query = db
    .select({
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
    })
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

  const jobs: ScheduledJob[] = filteredRows.map((r) => {
    const nextExecs = getNextExecutions(
      r.cronExpression,
      5,
      r.expectedDurationMs,
      r.timezone
    );

    return {
      id: r.id,
      name: r.name,
      description: r.description,
      sourceIdentifier: r.sourceIdentifier,
      cronExpression: r.cronExpression,
      timezone: r.timezone,
      targetModel: r.targetModel,
      preferredServerId: r.preferredServerId,
      preferredServerName: r.preferredServerName,
      expectedDurationMs: r.expectedDurationMs,
      isEnabled: r.isEnabled,
      nextExecutions: nextExecs.map((e) => e.start.toISOString()),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

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

    const jobsForConflict = existingJobs.map((j) => ({
      id: j.id,
      name: j.name,
      cronExpression: j.cronExpression,
      timezone: j.timezone,
      targetModel: j.targetModel,
      expectedDurationMs: j.expectedDurationMs,
    }));

    const conflicts = detectConflicts(jobsForConflict, 24);
    const relevantConflicts = conflicts.filter((c) =>
      c.jobs.some((j) => j.jobId === inserted.id)
    );

    // Get preferred server name if set
    let preferredServerName = null;
    if (inserted.preferredServerId) {
      const [server] = await db
        .select({ name: servers.name })
        .from(servers)
        .where(eq(servers.id, inserted.preferredServerId))
        .limit(1);
      preferredServerName = server?.name || null;
    }

    const nextExecs = getNextExecutions(
      inserted.cronExpression,
      5,
      inserted.expectedDurationMs,
      inserted.timezone
    );

    const response: ScheduledJob & { conflicts: typeof relevantConflicts } = {
      id: inserted.id,
      name: inserted.name,
      description: inserted.description,
      sourceIdentifier: inserted.sourceIdentifier,
      cronExpression: inserted.cronExpression,
      timezone: inserted.timezone,
      targetModel: inserted.targetModel,
      preferredServerId: inserted.preferredServerId,
      preferredServerName,
      expectedDurationMs: inserted.expectedDurationMs,
      isEnabled: inserted.isEnabled,
      nextExecutions: nextExecs.map((e) => e.start.toISOString()),
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
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
