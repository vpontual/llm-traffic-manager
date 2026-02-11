import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { modelEvents, servers } from "@/lib/schema";
import { desc, eq, gte } from "drizzle-orm";
import type { ModelEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const hours = parseInt(searchParams.get("hours") ?? "24", 10);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: modelEvents.id,
      serverId: modelEvents.serverId,
      serverName: servers.name,
      modelName: modelEvents.modelName,
      eventType: modelEvents.eventType,
      modelSize: modelEvents.modelSize,
      vramSize: modelEvents.vramSize,
      parameterSize: modelEvents.parameterSize,
      quantization: modelEvents.quantization,
      occurredAt: modelEvents.occurredAt,
    })
    .from(modelEvents)
    .innerJoin(servers, eq(modelEvents.serverId, servers.id))
    .where(gte(modelEvents.occurredAt, since))
    .orderBy(desc(modelEvents.occurredAt))
    .limit(500);

  const events: ModelEvent[] = rows.map((r) => ({
    id: r.id,
    serverId: r.serverId,
    serverName: r.serverName,
    modelName: r.modelName,
    eventType: r.eventType as "loaded" | "unloaded",
    modelSize: r.modelSize ?? 0,
    vramSize: r.vramSize ?? 0,
    parameterSize: r.parameterSize,
    quantization: r.quantization,
    occurredAt: r.occurredAt.toISOString(),
  }));

  return NextResponse.json(events);
}
