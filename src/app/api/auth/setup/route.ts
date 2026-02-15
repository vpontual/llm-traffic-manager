import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { hashPassword, generateApiKey, createSession, isFirstUser, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isFirstUser())) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 403 });
  }

  const { username, password } = await request.json();

  if (!username || !password || password.length < 4) {
    return NextResponse.json(
      { error: "Username required, password must be at least 4 characters" },
      { status: 400 }
    );
  }

  const [user] = await db.insert(users).values({
    username: username.toLowerCase().trim(),
    passwordHash: await hashPassword(password),
    isAdmin: true,
    apiKey: generateApiKey(),
  }).returning();

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
