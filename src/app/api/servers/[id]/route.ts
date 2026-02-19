// PATCH /api/servers/:id -- toggle server disabled state (admin only)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { servers } from "@/lib/schema";
import { withAdmin, jsonError } from "@/lib/api/route-helpers";
import { eq } from "drizzle-orm";
import { validateNumericId } from "@/lib/validations/numbers";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(async () => {
    const { id } = await params;
    const idValidation = validateNumericId(id, "server ID");
    if (!idValidation.ok) {
      return jsonError(idValidation.error, 400);
    }
    const serverId = idValidation.data;

    const body = await request.json();
    if (typeof body.isDisabled !== "boolean") {
      return jsonError("isDisabled must be a boolean", 400);
    }

    const [existing] = await db
      .select({ id: servers.id })
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!existing) {
      return jsonError("Server not found", 404);
    }

    await db
      .update(servers)
      .set({ isDisabled: body.isDisabled })
      .where(eq(servers.id, serverId));

    return NextResponse.json({ ok: true });
  });
}
