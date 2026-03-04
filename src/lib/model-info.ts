// Model info fetcher: enriches discoveries from ollama.com + registry API

import { parseModelName } from "./registry-check";
export {
  parseOllamaComHtml,
  getInfoFetchStatus,
  type OllamaComInfo,
  type RegistryInfo,
  type ModelInfo,
} from "./model-info-parse";
import type { OllamaComInfo, RegistryInfo, ModelInfo } from "./model-info-parse";
import { parseOllamaComHtml } from "./model-info-parse";

// --- ollama.com fetcher ---

export async function fetchOllamaComInfo(
  modelName: string
): Promise<OllamaComInfo | null> {
  const parsed = parseModelName(modelName);
  if (!parsed) return null;

  try {
    const res = await fetch(
      `https://ollama.com/library/${parsed.library}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return null;
    const html = await res.text();
    return parseOllamaComHtml(html);
  } catch {
    return null;
  }
}

// --- Registry config blob fetcher ---

export async function fetchRegistryInfo(
  modelName: string
): Promise<{ info: RegistryInfo; exists: boolean } | null> {
  const parsed = parseModelName(modelName);
  if (!parsed) return null;

  try {
    const manifestRes = await fetch(
      `https://registry.ollama.ai/v2/library/${parsed.library}/manifests/${parsed.tag}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!manifestRes.ok) {
      return { info: { modelFamily: null, families: [], modelType: null, fileType: null }, exists: false };
    }

    const manifest = await manifestRes.json() as {
      config?: { digest?: string };
    };

    const configDigest = manifest.config?.digest;
    if (!configDigest) {
      return { info: { modelFamily: null, families: [], modelType: null, fileType: null }, exists: true };
    }

    const blobRes = await fetch(
      `https://registry.ollama.ai/v2/library/${parsed.library}/blobs/${configDigest}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!blobRes.ok) {
      return { info: { modelFamily: null, families: [], modelType: null, fileType: null }, exists: true };
    }

    const blob = await blobRes.json() as Record<string, unknown>;

    return {
      info: {
        modelFamily: (blob.model_family as string) ?? null,
        families: Array.isArray(blob.model_families) ? blob.model_families as string[] : [],
        modelType: (blob.model_type as string) ?? null,
        fileType: (blob.file_type as string) ?? null,
      },
      exists: true,
    };
  } catch {
    return null;
  }
}

// --- Combined fetcher ---

export async function fetchModelInfo(modelName: string): Promise<ModelInfo> {
  const [ollamaCom, registryResult] = await Promise.all([
    fetchOllamaComInfo(modelName),
    fetchRegistryInfo(modelName),
  ]);

  return {
    ollamaCom,
    registry: registryResult?.info ?? null,
    registryExists: registryResult?.exists ?? false,
  };
}
