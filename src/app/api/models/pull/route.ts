// POST /api/models/pull -- trigger model pull on a server (admin only)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { managementActions, servers } from "@/lib/schema";
import { withAdmin } from "@/lib/api/route-helpers";
import { validatePullInput } from "@/lib/validations/model-management";
import { pullModel } from "@/lib/model-management";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withAdmin(async (user) => {
    const validation = validatePullInput(await request.json());
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { modelName, serverId } = validation.data;

    // Look up server
    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Create pending audit row
    const [action] = await db
      .insert(managementActions)
      .values({
        action: "pull",
        modelName,
        serverId,
        serverName: server.name,
        status: "pending",
        triggeredBy: user.username,
      })
      .returning({ id: managementActions.id });

    // Run pull in background (don't await in the response)
    pullModel(server.host, modelName).then(async (result) => {
      await db
        .update(managementActions)
        .set({
          status: result.success ? "success" : "failed",
          detail: result.detail,
        })
        .where(eq(managementActions.id, action.id));
    });

    return NextResponse.json({ actionId: action.id, status: "pending" });
  });
}
