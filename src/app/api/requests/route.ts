import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestLogs, servers } from "@/lib/schema";
import { desc, gte, eq, sql } from "drizzle-orm";
import { getHoursWindow } from "@/lib/api/time-window";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const { since } = getHoursWindow(searchParams, 24);

  // Get recent requests
  const recentRequests = await db
    .select({
      id: requestLogs.id,
      sourceIp: requestLogs.sourceIp,
      model: requestLogs.model,
      endpoint: requestLogs.endpoint,
      method: requestLogs.method,
      targetHost: requestLogs.targetHost,
      statusCode: requestLogs.statusCode,
      durationMs: requestLogs.durationMs,
      createdAt: requestLogs.createdAt,
    })
    .from(requestLogs)
    .where(gte(requestLogs.createdAt, since))
    .orderBy(desc(requestLogs.createdAt))
    .limit(500);

  // Get summary: requests per source IP + model
  const summary = await db
    .select({
      sourceIp: requestLogs.sourceIp,
      model: requestLogs.model,
      targetHost: requestLogs.targetHost,
      count: sql<number>`count(*)::int`,
      avgDuration: sql<number>`avg(${requestLogs.durationMs})::int`,
    })
    .from(requestLogs)
    .where(gte(requestLogs.createdAt, since))
    .groupBy(requestLogs.sourceIp, requestLogs.model, requestLogs.targetHost)
    .orderBy(sql`count(*) desc`)
    .limit(100);

  return NextResponse.json({
    requests: recentRequests.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    summary,
  });
}
