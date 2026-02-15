import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { hashPassword, generateApiKey, createSession, isFirstUser, SESSION_COOKIE } from "@/lib/auth";
import { validateSetupInput } from "@/lib/validations/auth";
import { isProduction } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isFirstUser())) {
    return NextResponse.json({ error: "Setup already completed" }, { status: 403 });
  }

  const validation = validateSetupInput(await request.json());
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  const { username, password } = validation.data;

  const [user] = await db.insert(users).values({
    username,
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
    secure: isProduction(),
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
}
