// Time window helpers -- parse hours param and compute since-date

import { parsePositiveInt } from "../validations/numbers";

const HOUR_MS = 60 * 60 * 1000;

export function getHoursParam(
  searchParams: URLSearchParams,
  defaultHours: number,
  maxHours?: number
): number {
  const hours = parsePositiveInt(searchParams.get("hours"), defaultHours);

  if (maxHours === undefined) {
    return hours;
  }

  return Math.min(hours, maxHours);
}

export function getHoursWindow(
  searchParams: URLSearchParams,
  defaultHours: number,
  maxHours?: number
): { hours: number; since: Date } {
  const hours = getHoursParam(searchParams, defaultHours, maxHours);
  return {
    hours,
    since: new Date(Date.now() - hours * HOUR_MS),
  };
}
