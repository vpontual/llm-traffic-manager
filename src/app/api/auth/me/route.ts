// GET /api/auth/me -- return current session user or setup status

import { NextResponse } from "next/server";
import { getSessionUser, isFirstUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const needsSetup = await isFirstUser();
  if (needsSetup) {
    return NextResponse.json({ needsSetup: true, user: null });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: { id: user.id, username: user.username, isAdmin: user.isAdmin, apiKey: user.apiKey },
  });
}
