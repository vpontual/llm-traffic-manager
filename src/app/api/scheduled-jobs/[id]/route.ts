// GET/PUT/DELETE /api/scheduled-jobs/:id -- manage individual scheduled job

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledJobs, servers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import type { ScheduledJob } from "@/lib/types";
import { jsonError } from "@/lib/api/route-helpers";
import {
  getPreferredServerName,
  scheduledJobWithServerSelect,
  toScheduledJob,
  toScheduledJobWithServerName,
} from "@/lib/scheduled-jobs";
import {
  validateScheduledJobUpdates,
} from "@/lib/validations/scheduled-jobs";
import { validateNumericId } from "@/lib/validations/numbers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobIdValidation = validateNumericId(id, "job ID");
  if (!jobIdValidation.ok) {
    return jsonError(jobIdValidation.error, 400);
  }
  const jobId = jobIdValidation.data;

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
    const jobIdValidation = validateNumericId(id, "job ID");
    if (!jobIdValidation.ok) {
      return jsonError(jobIdValidation.error, 400);
    }
    const jobId = jobIdValidation.data;

    const updatesValidation = validateScheduledJobUpdates(await request.json());
    if (!updatesValidation.ok) {
      return NextResponse.json(
        { error: updatesValidation.error },
        { status: 400 }
      );
    }

    const updates = updatesValidation.data;

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
  const jobIdValidation = validateNumericId(id, "job ID");
  if (!jobIdValidation.ok) {
    return jsonError(jobIdValidation.error, 400);
  }
  const jobId = jobIdValidation.data;

  const [deleted] = await db
    .delete(scheduledJobs)
    .where(eq(scheduledJobs.id, jobId))
    .returning({ id: scheduledJobs.id });

  if (!deleted) {
    return jsonError("Job not found", 404);
  }

  return NextResponse.json({ success: true, id: deleted.id });
}
