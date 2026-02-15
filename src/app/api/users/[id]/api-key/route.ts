import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { generateApiKey } from "@/lib/auth";
import { forbiddenResponse, isSelfOrAdmin, withAuth } from "@/lib/api/route-helpers";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(async (caller) => {
    const { id } = await params;
    const targetId = Number.parseInt(id, 10);

    // Admin can regen anyone's key, users can only regen their own
    if (!isSelfOrAdmin(caller, targetId)) {
      return forbiddenResponse();
    }

    const newKey = generateApiKey();
    await db.update(users).set({ apiKey: newKey, updatedAt: new Date() }).where(eq(users.id, targetId));

    return NextResponse.json({ apiKey: newKey });
  });
}
