import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { modelEvents, requestLogs, servers, serverSnapshots } from "@/lib/schema";
import { eq, gte, and, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface ModelRecommendation {
  modelName: string;
  serverName: string;
  serverId: number;
  loadCount: number;
  unloadCount: number;
  requestCount: number;
  churnScore: number;
  availableOn: string[];
  totalServers: number;
}

interface RecommendationsResponse {
  considerRemoving: ModelRecommendation[];
  considerAdding: ModelRecommendation[];
  periodHours: number;
  serverNames: string[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const hours = parseInt(searchParams.get("hours") ?? "168", 10);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // 1. Get all servers and build availability map from latest snapshots
  const allServers = await db.select().from(servers);
  const totalServers = allServers.length;
  const serverNames = allServers.map((s) => s.name);

  const availabilityMap = new Map<string, string[]>();

  for (const server of allServers) {
    const [latest] = await db
      .select()
      .from(serverSnapshots)
      .where(eq(serverSnapshots.serverId, server.id))
      .orderBy(desc(serverSnapshots.polledAt))
      .limit(1);

    const available = (latest?.availableModels ?? []) as Array<{ name: string }>;
    for (const model of available) {
      const existing = availabilityMap.get(model.name) ?? [];
      existing.push(server.name);
      availabilityMap.set(model.name, existing);
    }
  }

  // 2. Get event counts per (server, model) in the time window
  const eventCounts = await db
    .select({
      serverId: modelEvents.serverId,
      serverName: servers.name,
      modelName: modelEvents.modelName,
      loadCount: sql<number>`count(*) filter (where ${modelEvents.eventType} = 'loaded')`,
      unloadCount: sql<number>`count(*) filter (where ${modelEvents.eventType} = 'unloaded')`,
    })
    .from(modelEvents)
    .innerJoin(servers, eq(modelEvents.serverId, servers.id))
    .where(gte(modelEvents.occurredAt, since))
    .groupBy(modelEvents.serverId, servers.name, modelEvents.modelName);

  // 3. Get request counts per (server, model) in the time window
  const reqCounts = await db
    .select({
      serverId: requestLogs.targetServerId,
      model: requestLogs.model,
      count: sql<number>`count(*)::int`,
    })
    .from(requestLogs)
    .where(
      and(gte(requestLogs.createdAt, since), sql`${requestLogs.model} is not null`)
    )
    .groupBy(requestLogs.targetServerId, requestLogs.model);

  const reqMap = new Map<string, number>();
  for (const r of reqCounts) {
    if (r.serverId && r.model) {
      reqMap.set(`${r.serverId}:${r.model}`, r.count);
    }
  }

  // 4. Build "consider removing" list
  const considerRemoving: ModelRecommendation[] = [];
  for (const ec of eventCounts) {
    const loadCount = Number(ec.loadCount);
    const unloadCount = Number(ec.unloadCount);
    const requestCount = reqMap.get(`${ec.serverId}:${ec.modelName}`) ?? 0;
    const churnScore = loadCount - requestCount;
    const availableOn = availabilityMap.get(ec.modelName) ?? [];

    // Skip models no longer installed on this server (already removed)
    if (!availableOn.includes(ec.serverName)) continue;

    if (loadCount >= 10 && requestCount <= 2 && churnScore >= 10) {
      considerRemoving.push({
        modelName: ec.modelName,
        serverName: ec.serverName,
        serverId: ec.serverId,
        loadCount,
        unloadCount,
        requestCount,
        churnScore,
        availableOn,
        totalServers,
      });
    }
  }
  considerRemoving.sort((a, b) => b.churnScore - a.churnScore);

  // 5. Build "consider adding" list
  // Only recommend models that are on exactly 1 server (true SPOF with no
  // load distribution). Models on 2+ servers don't need to be everywhere —
  // e.g. small models on both Nanos don't belong on the AGX.
  const modelRequests = await db
    .select({
      model: requestLogs.model,
      totalRequests: sql<number>`count(*)::int`,
    })
    .from(requestLogs)
    .where(
      and(gte(requestLogs.createdAt, since), sql`${requestLogs.model} is not null`)
    )
    .groupBy(requestLogs.model);

  const considerAdding: ModelRecommendation[] = [];
  for (const mr of modelRequests) {
    if (!mr.model) continue;
    const total = Number(mr.totalRequests);
    const availableOn = availabilityMap.get(mr.model) ?? [];
    // Only flag models on exactly 1 server with meaningful demand
    if (total >= 10 && availableOn.length === 1) {
      considerAdding.push({
        modelName: mr.model,
        serverName: "",
        serverId: 0,
        loadCount: 0,
        unloadCount: 0,
        requestCount: total,
        churnScore: 0,
        availableOn,
        totalServers,
      });
    }
  }
  considerAdding.sort((a, b) => b.requestCount - a.requestCount);

  return NextResponse.json({
    considerRemoving,
    considerAdding,
    periodHours: hours,
    serverNames,
  } satisfies RecommendationsResponse);
}
