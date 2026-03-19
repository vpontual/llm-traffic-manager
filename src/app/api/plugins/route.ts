// GET /api/plugins -- return loaded plugin manifests

import { NextResponse } from "next/server";
import { getPluginRegistry } from "@/lib/plugins";
import { withAuth } from "@/lib/api/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAuth(async () => {
  return NextResponse.json(getPluginRegistry());
});
}
