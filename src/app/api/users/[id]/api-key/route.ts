import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { requireAuth, generateApiKey } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let caller;
  try {
    caller = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const targetId = parseInt(id, 10);

  // Admin can regen anyone's key, users can only regen their own
  if (!caller.isAdmin && caller.id !== targetId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const newKey = generateApiKey();
  await db.update(users).set({ apiKey: newKey, updatedAt: new Date() }).where(eq(users.id, targetId));

  return NextResponse.json({ apiKey: newKey });
}
