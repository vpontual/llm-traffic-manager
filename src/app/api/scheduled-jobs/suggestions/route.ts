import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledJobs } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { findOpenSlots } from "@/lib/cron-utils";
import type { TimeSlot } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const model = searchParams.get("model");
  const durationMs = parseInt(searchParams.get("durationMs") ?? "60000", 10);
  const hours = Math.min(parseInt(searchParams.get("hours") ?? "24", 10), 168);

  if (!model) {
    return NextResponse.json(
      { error: "Missing required parameter: model" },
      { status: 400 }
    );
  }

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
