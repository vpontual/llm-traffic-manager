// Request body parsing utilities for the Ollama proxy

/**
 * Extract the model name from an Ollama API request body.
 * Handles both "model" (standard) and "name" (used by /api/copy, /api/create) fields.
 */
export function extractModel(body: Buffer): string | null {
  try {
    const parsed = JSON.parse(body.toString());
    return parsed.model ?? parsed.name ?? null;
  } catch {
    return null;
  }
}
