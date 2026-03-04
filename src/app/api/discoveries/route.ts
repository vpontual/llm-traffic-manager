// GET /api/discoveries -- return recent model discoveries with service affinities

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { modelDiscoveries, requestLogs } from "@/lib/schema";
import { desc, gte, sql } from "drizzle-orm";
import { getHoursWindow } from "@/lib/api/time-window";
import {
  findServiceAffinities,
  buildModelFamilyMap,
  parseBaseFamily,
  type SourceModelUsage,
} from "@/lib/service-affinity";
import { parsePositiveInt } from "@/lib/validations/numbers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const { hours, since } = getHoursWindow(searchParams, 168);
  const limit = parsePositiveInt(searchParams.get("limit"), 50);

  // Fetch recent discoveries
  const discoveries = await db
    .select()
    .from(modelDiscoveries)
    .orderBy(desc(modelDiscoveries.discoveredAt))
    .limit(Math.min(limit, 200));

  // Fetch source-model usage data from request logs within the time window
  const usageRows = await db
    .select({
      source: requestLogs.sourceIp,
      model: requestLogs.model,
      requestCount: sql<number>`count(*)::int`,
    })
    .from(requestLogs)
    .where(gte(requestLogs.createdAt, since))
    .groupBy(requestLogs.sourceIp, requestLogs.model);

  const usageData: SourceModelUsage[] = usageRows
    .filter((r) => r.model !== null)
    .map((r) => ({
      source: r.source,
      model: r.model!,
      requestCount: r.requestCount,
    }));

  // Build family map from discoveries + base-name fallback for usage models
  const familyMap = buildModelFamilyMap(
    discoveries.map((d) => ({
      modelName: d.modelName,
      modelFamily: d.modelFamily,
      families: (d.families as string[]) ?? [],
    }))
  );

  // Add fallback entries for any usage models not in discoveries
  for (const u of usageData) {
    if (!familyMap.has(u.model)) {
      const base = parseBaseFamily(u.model);
      familyMap.set(u.model, { family: base, families: [base] });
    }
  }

  // Compute affinities per discovery
  const result = discoveries.map((d) => {
    const affinities = findServiceAffinities(
      d.modelFamily,
      (d.families as string[]) ?? [],
      d.modelName,
      usageData,
      familyMap
    );

    return {
      id: d.id,
      modelName: d.modelName,
      modelFamily: d.modelFamily,
      families: d.families,
      parameterSize: d.parameterSize,
      quantization: d.quantization,
      modelSize: d.modelSize,
      description: d.description,
      capabilities: d.capabilities,
      pullCount: d.pullCount,
      registryExists: d.registryExists,
      firstSeenServerName: d.firstSeenServerName,
      infoFetchStatus: d.infoFetchStatus,
      infoFetchedAt: d.infoFetchedAt?.toISOString() ?? null,
      discoveredAt: d.discoveredAt.toISOString(),
      serviceAffinities: affinities,
    };
  });

  return NextResponse.json({ discoveries: result, periodHours: hours });
}
