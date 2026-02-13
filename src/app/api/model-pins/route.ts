import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { modelPins, servers } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
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
    .orderBy(desc(modelPins.priority));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelPattern, serverId, priority = 0, isEnabled = true } = body;

    if (!modelPattern || !serverId) {
      return NextResponse.json(
        { error: "Missing required fields: modelPattern, serverId" },
        { status: 400 }
      );
    }

    // Verify server exists
    const [server] = await db
      .select({ id: servers.id, name: servers.name })
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!server) {
      return NextResponse.json(
        { error: "Server not found" },
        { status: 400 }
      );
    }

    const [inserted] = await db
      .insert(modelPins)
      .values({ modelPattern, serverId, priority, isEnabled })
      .returning();

    return NextResponse.json(
      { ...inserted, serverName: server.name },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating model pin:", error);
    return NextResponse.json(
      { error: "Failed to create model pin" },
      { status: 500 }
    );
  }
}
