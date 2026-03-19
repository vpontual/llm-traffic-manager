// POST /api/poll -- trigger an immediate poll of all servers

import { NextResponse } from "next/server";
import { pollAllServers } from "@/lib/poller";
import { withAdmin } from "@/lib/api/route-helpers";

export const dynamic = "force-dynamic";

export async function POST() {
  return withAdmin(async () => {
  try {
    await pollAllServers();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
});
}
