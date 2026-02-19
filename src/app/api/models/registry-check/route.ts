// GET /api/models/registry-check?model=llama3.2:8b -- check if model exists on registries

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/route-helpers";
import { checkModelRegistry } from "@/lib/registry-check";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(async () => {
    const model = request.nextUrl.searchParams.get("model");
    if (!model) {
      return NextResponse.json({ error: "model parameter required" }, { status: 400 });
    }

    const result = await checkModelRegistry(model);
    return NextResponse.json(result);
  });
}
