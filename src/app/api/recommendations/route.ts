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
  totalRequestCount: number;
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

  // Build total request count per model (across all servers) for context
  const totalReqByModel = new Map<string, number>();
  for (const r of reqCounts) {
    if (r.model) {
      totalReqByModel.set(r.model, (totalReqByModel.get(r.model) ?? 0) + r.count);
    }
  }

  // 4. Build "consider removing" list
  // A model is a removal candidate on a server when:
  // - It's available on at least 1 other server (removing won't lose access)
  // - It has meaningful churn (>= 5 loads in the period)
  // - Low utilization ratio on THIS server (proxy requests / loads < 15%)
  //   This catches both "0 requests" and "3 requests out of 200 loads"
  const considerRemoving: ModelRecommendation[] = [];
  for (const ec of eventCounts) {
    const loadCount = Number(ec.loadCount);
    const unloadCount = Number(ec.unloadCount);
    const requestCount = reqMap.get(`${ec.serverId}:${ec.modelName}`) ?? 0;
    const availableOn = availabilityMap.get(ec.modelName) ?? [];
    const totalRequestCount = totalReqByModel.get(ec.modelName) ?? 0;

    // Skip models no longer installed on this server
    if (!availableOn.includes(ec.serverName)) continue;

    // Must be available on at least 1 other server (safe to remove)
    if (availableOn.length < 2) continue;

    // Meaningful churn threshold
    if (loadCount < 5) continue;

    // Utilization ratio: what % of loads are from actual proxy requests?
    const utilization = loadCount > 0 ? requestCount / loadCount : 0;
    if (utilization >= 0.15) continue;

    // Churn score: loads that didn't serve a proxy request
    const churnScore = loadCount - requestCount;

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
      totalRequestCount,
    });
  }
  considerRemoving.sort((a, b) => b.churnScore - a.churnScore);

  // 5. Build "consider adding" list
  // Only recommend when concurrent request demand exceeds server capacity.
  // We estimate peak concurrency per model by bucketing requests into 1-minute
  // windows and using: peak_requests_per_minute * (avg_duration / 60s).
  // If estimated peak concurrency > number of servers hosting the model,
  // the existing servers can't keep up and the model needs more replicas.
  const concurrencyStats = await db.execute(sql`
    SELECT
      model,
      MAX(bucket_count) AS peak_per_minute,
      AVG(avg_dur_ms)::int AS avg_duration_ms,
      SUM(bucket_count)::int AS total_requests
    FROM (
      SELECT
        model,
        date_trunc('minute', created_at) AS bucket,
        COUNT(*) AS bucket_count,
        AVG(duration_ms) AS avg_dur_ms
      FROM request_logs
      WHERE created_at >= ${since.toISOString()}
        AND model IS NOT NULL
        AND duration_ms IS NOT NULL
      GROUP BY model, date_trunc('minute', created_at)
    ) sub
    GROUP BY model
  `);

  const considerAdding: ModelRecommendation[] = [];
  for (const row of concurrencyStats as unknown as Array<{
    model: string;
    peak_per_minute: string;
    avg_duration_ms: string;
    total_requests: string;
  }>) {
    const modelName = row.model;
    const peakPerMinute = Number(row.peak_per_minute);
    const avgDurationMs = Number(row.avg_duration_ms);
    const totalRequests = Number(row.total_requests);
    const availableOn = availabilityMap.get(modelName) ?? [];
    const numServers = availableOn.length;

    if (numServers === 0 || numServers >= totalServers) continue;

    // Estimate peak concurrency: during the busiest minute, how many requests
    // were likely running simultaneously?
    const avgDurationSec = avgDurationMs / 1000;
    const estimatedPeakConcurrency = peakPerMinute * (avgDurationSec / 60);

    // Only recommend if peak concurrency exceeds available server count
    // (the existing servers were saturated and requests were likely queuing)
    if (estimatedPeakConcurrency > numServers && totalRequests >= 10) {
      considerAdding.push({
        modelName,
        serverName: "",
        serverId: 0,
        loadCount: 0,
        unloadCount: 0,
        requestCount: totalRequests,
        churnScore: Math.round(estimatedPeakConcurrency * 10) / 10,
        availableOn,
        totalServers,
        totalRequestCount: totalRequests,
      });
    }
  }
  considerAdding.sort((a, b) => b.churnScore - a.churnScore);

  return NextResponse.json({
    considerRemoving,
    considerAdding,
    periodHours: hours,
    serverNames,
  } satisfies RecommendationsResponse);
}
