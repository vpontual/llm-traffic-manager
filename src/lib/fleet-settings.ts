// Fleet settings: typed key-value store for feature toggles

import { db } from "@/lib/db";
import { fleetSettings } from "@/lib/schema";
import { eq } from "drizzle-orm";

export type FleetSettingKey = "intelligent_management_enabled";

const DEFAULTS: Record<FleetSettingKey, unknown> = {
  intelligent_management_enabled: false,
};

export async function getFleetSetting<T>(key: FleetSettingKey): Promise<T> {
  const [row] = await db
    .select()
    .from(fleetSettings)
    .where(eq(fleetSettings.key, key))
    .limit(1);

  return (row ? row.value : DEFAULTS[key]) as T;
}

export async function setFleetSetting(
  key: FleetSettingKey,
  value: unknown
): Promise<void> {
  const [existing] = await db
    .select({ id: fleetSettings.id })
    .from(fleetSettings)
    .where(eq(fleetSettings.key, key))
    .limit(1);

  if (existing) {
    await db
      .update(fleetSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(fleetSettings.key, key));
  } else {
    await db.insert(fleetSettings).values({ key, value });
  }
}

export async function getAllFleetSettings(): Promise<Record<string, unknown>> {
  const rows = await db.select().from(fleetSettings);
  const result: Record<string, unknown> = { ...DEFAULTS };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
