// GET /api/system-metrics -- system metrics time-series for a server

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { systemMetrics } from "@/lib/schema";
import { eq, and, sql } from "drizzle-orm";
import { getHoursWindow } from "@/lib/api/time-window";
import { validateSystemMetricsServerId } from "@/lib/validations/system-metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { since } = getHoursWindow(searchParams, 6);
  const serverIdValidation = validateSystemMetricsServerId(searchParams);

  if (!serverIdValidation.ok) {
    return NextResponse.json({ error: serverIdValidation.error }, { status: 400 });
  }
  const serverId = serverIdValidation.data;

  // Sample ~1 row per minute to keep payloads reasonable
  const rows = await db
    .select()
    .from(systemMetrics)
    .where(
      and(
        eq(systemMetrics.serverId, serverId),
        sql`${systemMetrics.polledAt} > ${since}`
      )
    )
    .orderBy(systemMetrics.polledAt);

  // Downsample: keep 1 row per minute
  const sampled = [];
  let lastMinute = -1;
  for (const row of rows) {
    const minute = Math.floor(row.polledAt.getTime() / 60000);
    if (minute !== lastMinute) {
      sampled.push({
        cpuTempC: row.cpuTempC,
        gpuTempC: row.gpuTempC,
        memUsedMb: row.memUsedMb,
        memTotalMb: row.memTotalMb,
        swapUsedMb: row.swapUsedMb,
        loadAvg1: (row.loadAvg1 ?? 0) / 100,
        uptimeSeconds: row.uptimeSeconds,
        polledAt: row.polledAt.toISOString(),
      });
      lastMinute = minute;
    }
  }

  return NextResponse.json(sampled);
}
