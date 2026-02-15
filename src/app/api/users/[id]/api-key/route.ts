import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { generateApiKey } from "@/lib/auth";
import { forbiddenResponse, isSelfOrAdmin, jsonError, withAuth } from "@/lib/api/route-helpers";
import { eq } from "drizzle-orm";
import { validateNumericId } from "@/lib/validations/numbers";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(async (caller) => {
    const { id } = await params;
    const targetIdValidation = validateNumericId(id, "user ID");
    if (!targetIdValidation.ok) {
      return jsonError(targetIdValidation.error, 400);
    }
    const targetId = targetIdValidation.data;

    // Admin can regen anyone's key, users can only regen their own
    if (!isSelfOrAdmin(caller, targetId)) {
      return forbiddenResponse();
    }

    const newKey = generateApiKey();
    await db.update(users).set({ apiKey: newKey, updatedAt: new Date() }).where(eq(users.id, targetId));

    return NextResponse.json({ apiKey: newKey });
  });
}
