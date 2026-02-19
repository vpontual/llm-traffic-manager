// GET /api/servers -- return all servers with latest snapshot and metrics

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { servers, serverSnapshots, modelEvents, systemMetrics } from "@/lib/schema";
import { eq, desc, and } from "drizzle-orm";
import type { ServerState, OllamaRunningModel, OllamaAvailableModel, SystemMetrics } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const allServers = await db.select().from(servers);

  const states: ServerState[] = await Promise.all(
    allServers.map(async (server) => {
      // Get the latest snapshot for this server
      const [latest] = await db
        .select()
        .from(serverSnapshots)
        .where(eq(serverSnapshots.serverId, server.id))
        .orderBy(desc(serverSnapshots.polledAt))
        .limit(1);

      // Get load times for currently loaded models
      const loadedModels = (latest?.loadedModels ?? []) as OllamaRunningModel[];
      const modelLoadTimes: Record<string, string> = {};

      for (const model of loadedModels) {
        const [loadEvent] = await db
          .select({ occurredAt: modelEvents.occurredAt })
          .from(modelEvents)
          .where(
            and(
              eq(modelEvents.serverId, server.id),
              eq(modelEvents.modelName, model.name),
              eq(modelEvents.eventType, "loaded")
            )
          )
          .orderBy(desc(modelEvents.occurredAt))
          .limit(1);

        if (loadEvent) {
          modelLoadTimes[model.name] = loadEvent.occurredAt.toISOString();
        }
      }

      // Get latest system metrics
      const [latestMetrics] = await db
        .select()
        .from(systemMetrics)
        .where(eq(systemMetrics.serverId, server.id))
        .orderBy(desc(systemMetrics.polledAt))
        .limit(1);

      let sysMetrics: SystemMetrics | null = null;
      if (latestMetrics) {
        sysMetrics = {
          cpuTempC: latestMetrics.cpuTempC,
          gpuTempC: latestMetrics.gpuTempC,
          cpuPercent: latestMetrics.cpuPercent ?? null,
          gpuPercent: latestMetrics.gpuPercent ?? null,
          memTotalMb: latestMetrics.memTotalMb ?? 0,
          memUsedMb: latestMetrics.memUsedMb ?? 0,
          memAvailableMb: latestMetrics.memAvailableMb ?? 0,
          swapTotalMb: latestMetrics.swapTotalMb ?? 0,
          swapUsedMb: latestMetrics.swapUsedMb ?? 0,
          loadAvg: [
            (latestMetrics.loadAvg1 ?? 0) / 100,
            (latestMetrics.loadAvg5 ?? 0) / 100,
            (latestMetrics.loadAvg15 ?? 0) / 100,
          ],
          uptimeSeconds: latestMetrics.uptimeSeconds ?? 0,
          diskTotalGb: latestMetrics.diskTotalGb ?? 0,
          diskUsedGb: latestMetrics.diskUsedGb ?? 0,
          recentBoots: (latestMetrics.recentBoots as string[]) ?? [],
        };
      }

      return {
        id: server.id,
        name: server.name,
        host: server.host,
        totalRamGb: server.totalRamGb,
        isOnline: latest?.isOnline ?? false,
        ollamaVersion: latest?.ollamaVersion ?? null,
        loadedModels,
        availableModels: (latest?.availableModels ?? []) as OllamaAvailableModel[],
        totalVramUsed: latest?.totalVramUsed ?? 0,
        polledAt: latest?.polledAt?.toISOString() ?? null,
        modelLoadTimes,
        systemMetrics: sysMetrics,
        backendType: (server.backendType as "ollama" | "vllm" | "generic") ?? "ollama",
        isDisabled: server.isDisabled ?? false,
      };
    })
  );

  return NextResponse.json(states);
}
