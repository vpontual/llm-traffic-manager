const HOUR_MS = 60 * 60 * 1000;

export function getHoursParam(
  searchParams: URLSearchParams,
  defaultHours: number,
  maxHours?: number
): number {
  const hours = Number.parseInt(
    searchParams.get("hours") ?? String(defaultHours),
    10
  );

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
