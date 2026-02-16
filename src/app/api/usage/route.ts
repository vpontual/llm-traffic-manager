// GET /api/usage -- per-server model usage durations from event log

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { modelEvents, servers } from "@/lib/schema";
import { eq, gte, desc, asc, sql } from "drizzle-orm";
import { getHoursWindow } from "@/lib/api/time-window";

export const dynamic = "force-dynamic";

interface UsageRecord {
  serverName: string;
  serverId: number;
  modelName: string;
  totalLoadedSeconds: number;
  loadCount: number;
  lastSeen: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const { since } = getHoursWindow(searchParams, 168); // default 7 days

  // Get all events in the time range
  const events = await db
    .select({
      id: modelEvents.id,
      serverId: modelEvents.serverId,
      serverName: servers.name,
      modelName: modelEvents.modelName,
      eventType: modelEvents.eventType,
      occurredAt: modelEvents.occurredAt,
    })
    .from(modelEvents)
    .innerJoin(servers, eq(modelEvents.serverId, servers.id))
    .where(gte(modelEvents.occurredAt, since))
    .orderBy(asc(modelEvents.occurredAt));

  // Calculate durations by pairing load/unload events
  const now = Date.now();
  // Key: `serverId:modelName`
  const loadTimes = new Map<string, number>(); // currently loaded-at timestamp
  const usageMap = new Map<string, UsageRecord>();

  for (const event of events) {
    const key = `${event.serverId}:${event.modelName}`;

    if (!usageMap.has(key)) {
      usageMap.set(key, {
        serverName: event.serverName,
        serverId: event.serverId,
        modelName: event.modelName,
        totalLoadedSeconds: 0,
        loadCount: 0,
        lastSeen: event.occurredAt.toISOString(),
      });
    }

    const record = usageMap.get(key)!;
    record.lastSeen = event.occurredAt.toISOString();

    if (event.eventType === "loaded") {
      loadTimes.set(key, event.occurredAt.getTime());
      record.loadCount++;
    } else if (event.eventType === "unloaded") {
      const loadedAt = loadTimes.get(key);
      if (loadedAt) {
        const duration = (event.occurredAt.getTime() - loadedAt) / 1000;
        record.totalLoadedSeconds += duration;
        loadTimes.delete(key);
      }
    }
  }

  // For models still loaded, add time up to now
  for (const [key, loadedAt] of loadTimes) {
    const record = usageMap.get(key);
    if (record) {
      const duration = (now - loadedAt) / 1000;
      record.totalLoadedSeconds += duration;
    }
  }

  const usage = [...usageMap.values()].sort(
    (a, b) => b.totalLoadedSeconds - a.totalLoadedSeconds
  );

  return NextResponse.json(usage);
}
