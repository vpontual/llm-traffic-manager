import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledJobs } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { findOpenSlots } from "@/lib/cron-utils";
import type { TimeSlot } from "@/lib/types";
import { validateScheduledJobSuggestionsInput } from "@/lib/validations/scheduled-jobs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const validation = validateScheduledJobSuggestionsInput(searchParams);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }
  const { model, durationMs, hours } = validation.data;

  // Get all enabled jobs
  const jobs = await db
    .select()
    .from(scheduledJobs)
    .where(eq(scheduledJobs.isEnabled, true));

  const jobsForSlots = jobs.map((j) => ({
    id: j.id,
    name: j.name,
    cronExpression: j.cronExpression,
    timezone: j.timezone,
    targetModel: j.targetModel,
    expectedDurationMs: j.expectedDurationMs,
  }));

  const openSlots = findOpenSlots(jobsForSlots, model, durationMs, hours);

  const slots: TimeSlot[] = openSlots.map((slot) => ({
    startTime: slot.startTime.toISOString(),
    endTime: slot.endTime.toISOString(),
    durationMs,
  }));

  return NextResponse.json({ openSlots: slots });
}
