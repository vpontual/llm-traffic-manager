import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverEvents, servers } from "@/lib/schema";
import { desc, eq, gte } from "drizzle-orm";
import type { ServerEvent } from "@/lib/types";
import { getHoursWindow } from "@/lib/api/time-window";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const { since } = getHoursWindow(searchParams, 24);

  const rows = await db
    .select({
      id: serverEvents.id,
      serverId: serverEvents.serverId,
      serverName: servers.name,
      eventType: serverEvents.eventType,
      detail: serverEvents.detail,
      occurredAt: serverEvents.occurredAt,
    })
    .from(serverEvents)
    .innerJoin(servers, eq(serverEvents.serverId, servers.id))
    .where(gte(serverEvents.occurredAt, since))
    .orderBy(desc(serverEvents.occurredAt))
    .limit(100);

  const events: ServerEvent[] = rows.map((r) => ({
    id: r.id,
    serverId: r.serverId,
    serverName: r.serverName,
    eventType: r.eventType as "offline" | "online" | "reboot",
    detail: r.detail,
    occurredAt: r.occurredAt.toISOString(),
  }));

  return NextResponse.json(events);
}
