import { requireAdmin, requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";

type SessionUser = Awaited<ReturnType<typeof requireAuth>>;

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export function unauthorizedResponse(): NextResponse {
  return jsonError("Unauthorized", 401);
}

export function forbiddenResponse(): NextResponse {
  return jsonError("Forbidden", 403);
}

export async function withAuth(
  handler: (user: SessionUser) => Promise<NextResponse> | NextResponse
): Promise<NextResponse> {
  let user: SessionUser;
  try {
    user = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  return handler(user);
}

export async function withAdmin(
  handler: (user: SessionUser) => Promise<NextResponse> | NextResponse
): Promise<NextResponse> {
  let user: SessionUser;
  try {
    user = await requireAdmin();
  } catch {
    return forbiddenResponse();
  }

  return handler(user);
}

export function isSelfOrAdmin(user: SessionUser, targetId: number): boolean {
  return user.isAdmin || user.id === targetId;
}
