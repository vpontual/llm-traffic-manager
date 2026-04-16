import type { OllamaRunningModel, OllamaAvailableModel } from "./types";

export interface SnapshotFields {
  isOnline: boolean;
  ollamaVersion: string | null | undefined;
  loadedModels: OllamaRunningModel[];
  availableModels: OllamaAvailableModel[];
}

/**
 * Stable signature of a server's observed state. Used to dedup
 * server_snapshots: only INSERT when the signature changes, otherwise
 * UPDATE polledAt on the previous row.
 *
 * Strips `expires_at` from running models — it ticks down with keep_alive
 * and would defeat dedup.
 */
export function computeSnapshotSignature(input: SnapshotFields): string {
  const loaded = input.loadedModels
    .map(({ expires_at: _ignored, ...rest }) => rest)
    .sort((a, b) => a.name.localeCompare(b.name));
  const available = [...input.availableModels].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  return JSON.stringify({
    online: input.isOnline,
    version: input.ollamaVersion ?? null,
    loaded,
    available,
  });
}
