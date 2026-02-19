// GET/PUT /api/settings/fleet -- fleet-wide settings (management toggle)

import { NextRequest, NextResponse } from "next/server";
import { withAuth, withAdmin } from "@/lib/api/route-helpers";
import {
  getAllFleetSettings,
  setFleetSetting,
  type FleetSettingKey,
} from "@/lib/fleet-settings";

export const dynamic = "force-dynamic";

const VALID_KEYS: Set<FleetSettingKey> = new Set([
  "intelligent_management_enabled",
]);

export async function GET() {
  return withAuth(async () => {
    const settings = await getAllFleetSettings();
    return NextResponse.json(settings);
  });
}

export async function PUT(request: NextRequest) {
  return withAdmin(async () => {
    const body = await request.json();
    const { key, value } = body as { key: string; value: unknown };

    if (!key || !VALID_KEYS.has(key as FleetSettingKey)) {
      return NextResponse.json({ error: "Invalid setting key" }, { status: 400 });
    }

    await setFleetSetting(key as FleetSettingKey, value);
    return NextResponse.json({ ok: true });
  });
}
