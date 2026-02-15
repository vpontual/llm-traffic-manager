import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { hashPassword, generateApiKey } from "@/lib/auth";
import { withAdmin } from "@/lib/api/route-helpers";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdmin(async () => {
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
      })
      .from(users);

    return NextResponse.json(allUsers);
  });
}

export async function POST(request: NextRequest) {
  return withAdmin(async () => {
    const { username, password, isAdmin } = await request.json();

    if (!username || !password || password.length < 4) {
      return NextResponse.json(
        { error: "Username required, password at least 4 characters" },
        { status: 400 }
      );
    }

    // Check uniqueness
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username.toLowerCase().trim()))
      .limit(1);

    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const [user] = await db.insert(users).values({
      username: username.toLowerCase().trim(),
      passwordHash: await hashPassword(password),
      isAdmin: isAdmin ?? false,
      apiKey: generateApiKey(),
    }).returning({
      id: users.id,
      username: users.username,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
    });

    return NextResponse.json(user, { status: 201 });
  });
}
