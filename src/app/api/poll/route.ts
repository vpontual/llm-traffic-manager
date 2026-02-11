import { NextResponse } from "next/server";
import { pollAllServers } from "@/lib/poller";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await pollAllServers();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
