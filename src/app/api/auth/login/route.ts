import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, createSession, SESSION_COOKIE } from "@/lib/auth";
import { validateLoginInput } from "@/lib/validations/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const validation = validateLoginInput(await request.json());
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { username, password } = validation.data;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const sessionId = await createSession(user.id);

  const response = NextResponse.json({
    user: { id: user.id, username: user.username, isAdmin: user.isAdmin },
  });

  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
}
