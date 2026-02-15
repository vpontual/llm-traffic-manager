import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledJobs, servers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { isValidCron } from "@/lib/cron-utils";
import type { ScheduledJob } from "@/lib/types";
import { jsonError, parseNumericId } from "@/lib/api/route-helpers";
import {
  getPreferredServerName,
  scheduledJobWithServerSelect,
  toScheduledJob,
  toScheduledJobWithServerName,
} from "@/lib/scheduled-jobs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseNumericId(id);

  if (jobId === null) {
    return jsonError("Invalid job ID", 400);
  }

  const [row] = await db
    .select(scheduledJobWithServerSelect)
    .from(scheduledJobs)
    .leftJoin(servers, eq(scheduledJobs.preferredServerId, servers.id))
    .where(eq(scheduledJobs.id, jobId))
    .limit(1);

  if (!row) {
    return jsonError("Job not found", 404);
  }

  const job: ScheduledJob = toScheduledJob(row);

  return NextResponse.json(job);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobId = parseNumericId(id);

    if (jobId === null) {
      return jsonError("Invalid job ID", 400);
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
      return jsonError("Job not found", 404);
    }

    const preferredServerName = await getPreferredServerName(updated.preferredServerId);
    const job: ScheduledJob = toScheduledJobWithServerName(
      updated,
      preferredServerName
    );

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseNumericId(id);

  if (jobId === null) {
    return jsonError("Invalid job ID", 400);
  }

  const [deleted] = await db
    .delete(scheduledJobs)
    .where(eq(scheduledJobs.id, jobId))
    .returning({ id: scheduledJobs.id });

  if (!deleted) {
    return jsonError("Job not found", 404);
  }

  return NextResponse.json({ success: true, id: deleted.id });
}
