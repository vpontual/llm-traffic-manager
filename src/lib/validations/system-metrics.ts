import { ValidationResult } from "./common";
import { validatePositiveInt } from "./numbers";

export function validateSystemMetricsServerId(
  searchParams: URLSearchParams
): ValidationResult<number> {
  return validatePositiveInt(searchParams.get("serverId"), "serverId required");
}
