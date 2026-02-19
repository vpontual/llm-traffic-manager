// POST /api/models/delete -- delete a model from a server (admin only)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { managementActions, servers } from "@/lib/schema";
import { withAdmin } from "@/lib/api/route-helpers";
import { validateDeleteInput } from "@/lib/validations/model-management";
import { checkModelRegistry } from "@/lib/registry-check";
import { deleteModel } from "@/lib/model-management";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withAdmin(async (user) => {
    const validation = validateDeleteInput(await request.json());
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { modelName, serverId, acknowledgeCustom } = validation.data;

    // Look up server
    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Always check registry before deleting
    const registryCheck = await checkModelRegistry(modelName);

    if (registryCheck.isCustom && !acknowledgeCustom) {
      return NextResponse.json(
        {
          blocked: true,
          reason: "custom_model",
          registryCheck,
        },
        { status: 409 }
      );
    }

    // Create audit row
    const [action] = await db
      .insert(managementActions)
      .values({
        action: "delete",
        modelName,
        serverId,
        serverName: server.name,
        status: "pending",
        triggeredBy: user.username,
      })
      .returning({ id: managementActions.id });

    // Delete is fast, execute synchronously
    const result = await deleteModel(server.host, modelName);

    await db
      .update(managementActions)
      .set({
        status: result.success ? "success" : "failed",
        detail: result.detail,
      })
      .where(eq(managementActions.id, action.id));

    return NextResponse.json({
      actionId: action.id,
      status: result.success ? "success" : "failed",
      detail: result.detail,
    });
  });
}
