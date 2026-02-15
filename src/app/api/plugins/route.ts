import { NextResponse } from "next/server";
import { getPluginRegistry } from "@/lib/plugins";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPluginRegistry());
}
