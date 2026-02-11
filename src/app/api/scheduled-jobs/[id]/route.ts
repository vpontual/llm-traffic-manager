import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledJobs, servers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getNextExecutions, isValidCron } from "@/lib/cron-utils";
import type { ScheduledJob } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);

  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const [row] = await db
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
    .where(eq(scheduledJobs.id, jobId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const nextExecs = getNextExecutions(
    row.cronExpression,
    5,
    row.expectedDurationMs,
    row.timezone
  );

  const job: ScheduledJob = {
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

  return NextResponse.json(job);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobId = parseInt(id, 10);

    if (isNaN(jobId)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const body = await request.json();
    const {
      name,
      description,
      sourceIdentifier,
      cronExpression,
      timezone,
      targetModel,
      preferredServerId,
      expectedDurationMs,
      isEnabled,
    } = body;

    // Validate cron if provided
    if (cronExpression && !isValidCron(cronExpression)) {
      return NextResponse.json(
        { error: "Invalid cron expression" },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (sourceIdentifier !== undefined) updates.sourceIdentifier = sourceIdentifier;
    if (cronExpression !== undefined) updates.cronExpression = cronExpression;
    if (timezone !== undefined) updates.timezone = timezone;
    if (targetModel !== undefined) updates.targetModel = targetModel;
    if (preferredServerId !== undefined) updates.preferredServerId = preferredServerId;
    if (expectedDurationMs !== undefined) updates.expectedDurationMs = expectedDurationMs;
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;

    const [updated] = await db
      .update(scheduledJobs)
      .set(updates)
      .where(eq(scheduledJobs.id, jobId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Get preferred server name
    let preferredServerName = null;
    if (updated.preferredServerId) {
      const [server] = await db
        .select({ name: servers.name })
        .from(servers)
        .where(eq(servers.id, updated.preferredServerId))
        .limit(1);
      preferredServerName = server?.name || null;
    }

    const nextExecs = getNextExecutions(
      updated.cronExpression,
      5,
      updated.expectedDurationMs,
      updated.timezone
    );

    const job: ScheduledJob = {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      sourceIdentifier: updated.sourceIdentifier,
      cronExpression: updated.cronExpression,
      timezone: updated.timezone,
      targetModel: updated.targetModel,
      preferredServerId: updated.preferredServerId,
      preferredServerName,
      expectedDurationMs: updated.expectedDurationMs,
      isEnabled: updated.isEnabled,
      nextExecutions: nextExecs.map((e) => e.start.toISOString()),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    return NextResponse.json(job);
  } catch (error) {
    console.error("Error updating scheduled job:", error);
    return NextResponse.json(
      { error: "Failed to update scheduled job" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);

  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(scheduledJobs)
    .where(eq(scheduledJobs.id, jobId))
    .returning({ id: scheduledJobs.id });

  if (!deleted) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: deleted.id });
}
