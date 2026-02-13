import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { modelPins, servers } from "@/lib/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pinId = parseInt(id, 10);

  if (isNaN(pinId)) {
    return NextResponse.json({ error: "Invalid pin ID" }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: modelPins.id,
      modelPattern: modelPins.modelPattern,
      serverId: modelPins.serverId,
      serverName: servers.name,
      priority: modelPins.priority,
      isEnabled: modelPins.isEnabled,
      createdAt: modelPins.createdAt,
    })
    .from(modelPins)
    .leftJoin(servers, eq(modelPins.serverId, servers.id))
    .where(eq(modelPins.id, pinId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Pin not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pinId = parseInt(id, 10);

    if (isNaN(pinId)) {
      return NextResponse.json({ error: "Invalid pin ID" }, { status: 400 });
    }

    const body = await request.json();
    const { modelPattern, serverId, priority, isEnabled } = body;

    const updates: Record<string, unknown> = {};
    if (modelPattern !== undefined) updates.modelPattern = modelPattern;
    if (serverId !== undefined) updates.serverId = serverId;
    if (priority !== undefined) updates.priority = priority;
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;

    const [updated] = await db
      .update(modelPins)
      .set(updates)
      .where(eq(modelPins.id, pinId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Pin not found" }, { status: 404 });
    }

    // Get server name
    let serverName = null;
    if (updated.serverId) {
      const [server] = await db
        .select({ name: servers.name })
        .from(servers)
        .where(eq(servers.id, updated.serverId))
        .limit(1);
      serverName = server?.name || null;
    }

    return NextResponse.json({ ...updated, serverName });
  } catch (error) {
    console.error("Error updating model pin:", error);
    return NextResponse.json(
      { error: "Failed to update model pin" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pinId = parseInt(id, 10);

  if (isNaN(pinId)) {
    return NextResponse.json({ error: "Invalid pin ID" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(modelPins)
    .where(eq(modelPins.id, pinId))
    .returning({ id: modelPins.id });

  if (!deleted) {
    return NextResponse.json({ error: "Pin not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: deleted.id });
}
