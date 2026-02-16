// GET/PUT /api/settings/subscriptions -- manage server alert subscriptions

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userServerSubscriptions, servers } from "@/lib/schema";
import { withAuth } from "@/lib/api/route-helpers";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAuth(async (user) => {
    const subs = await db
      .select({
        id: userServerSubscriptions.id,
        serverId: userServerSubscriptions.serverId,
        serverName: servers.name,
        notifyOffline: userServerSubscriptions.notifyOffline,
        notifyOnline: userServerSubscriptions.notifyOnline,
        notifyReboot: userServerSubscriptions.notifyReboot,
      })
      .from(userServerSubscriptions)
      .innerJoin(servers, eq(userServerSubscriptions.serverId, servers.id))
      .where(eq(userServerSubscriptions.userId, user.id));

    return NextResponse.json(subs);
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(async (user) => {
    const subscriptions: Array<{
      serverId: number;
      notifyOffline: boolean;
      notifyOnline: boolean;
      notifyReboot: boolean;
    }> = await request.json();

    // Delete all existing, then bulk insert
    await db.delete(userServerSubscriptions).where(eq(userServerSubscriptions.userId, user.id));

    if (subscriptions.length > 0) {
      await db.insert(userServerSubscriptions).values(
        subscriptions.map((s) => ({
          userId: user.id,
          serverId: s.serverId,
          notifyOffline: s.notifyOffline,
          notifyOnline: s.notifyOnline,
          notifyReboot: s.notifyReboot,
        }))
      );
    }

    return NextResponse.json({ ok: true });
  });
}
