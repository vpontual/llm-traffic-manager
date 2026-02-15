export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function valid<T>(data: T): ValidationResult<T> {
  return { ok: true, data };
}

export function invalid<T = never>(error: string): ValidationResult<T> {
  return { ok: false, error };
}
