// GET /api/models/actions -- recent management actions audit log (admin only)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { managementActions } from "@/lib/schema";
import { withAdmin } from "@/lib/api/route-helpers";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAdmin(async () => {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "50", 10) || 50, 1), 200);

    const actions = await db
      .select()
      .from(managementActions)
      .orderBy(desc(managementActions.createdAt))
      .limit(limit);

    return NextResponse.json(actions);
  });
}
