import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { requireAuth, hashPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
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
  const body = await request.json();

  // Non-admin can only change their own password
  if (!caller.isAdmin && caller.id !== targetId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.password) {
    updates.passwordHash = await hashPassword(body.password);
  }

  if (caller.isAdmin && body.isAdmin !== undefined) {
    updates.isAdmin = body.isAdmin;
  }

  await db.update(users).set(updates).where(eq(users.id, targetId));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let caller;
  try {
    caller = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!caller.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const targetId = parseInt(id, 10);

  if (caller.id === targetId) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  await db.delete(users).where(eq(users.id, targetId));
  return NextResponse.json({ ok: true });
}
