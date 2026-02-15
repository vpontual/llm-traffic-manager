import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { isProduction } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    maxAge: 0,
    path: "/",
    secure: isProduction(),
    sameSite: "lax",
    httpOnly: true,
  });
  return response;
}
