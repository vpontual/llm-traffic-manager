// Registry verification: check if a model exists on Ollama registry or HuggingFace

export interface RegistryCheckResult {
  modelName: string;
  existsOnOllama: boolean;
  existsOnHuggingFace: boolean;
  isCustom: boolean;
  checkedAt: string;
}

// Parse "llama3.2:8b" → { library: "llama3.2", tag: "8b" }
// Parse "llama3.2" → { library: "llama3.2", tag: "latest" }
// Returns null for HuggingFace-format names (containing "/")
export function parseModelName(
  name: string
): { library: string; tag: string } | null {
  if (!name || name.includes("/")) return null;
  const [library, tag] = name.split(":");
  if (!library) return null;
  return { library, tag: tag || "latest" };
}

// HEAD https://registry.ollama.ai/v2/library/{library}/manifests/{tag}
export async function checkOllamaRegistry(
  library: string,
  tag: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://registry.ollama.ai/v2/library/${library}/manifests/${tag}`,
      { method: "HEAD", signal: AbortSignal.timeout(10_000) }
    );
    return res.status === 200;
  } catch {
    return false;
  }
}

// For HF-format names, GET https://huggingface.co/api/models/{repo}
export async function checkHuggingFace(modelName: string): Promise<boolean> {
  try {
    // Strip tag if present (e.g. "hf.co/user/repo:q4" → "user/repo")
    let repo = modelName;
    if (repo.startsWith("hf.co/")) repo = repo.slice(6);
    const colonIdx = repo.indexOf(":");
    if (colonIdx !== -1) repo = repo.slice(0, colonIdx);

    const res = await fetch(`https://huggingface.co/api/models/${repo}`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

// In-memory cache: modelName → { result, expiry }
const cache = new Map<string, { result: RegistryCheckResult; expiry: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function checkModelRegistry(
  modelName: string
): Promise<RegistryCheckResult> {
  const cached = cache.get(modelName);
  if (cached && cached.expiry > Date.now()) return cached.result;

  let existsOnOllama = false;
  let existsOnHuggingFace = false;

  const parsed = parseModelName(modelName);
  if (parsed) {
    // Standard Ollama model name
    existsOnOllama = await checkOllamaRegistry(parsed.library, parsed.tag);
  } else {
    // HuggingFace-format name
    existsOnHuggingFace = await checkHuggingFace(modelName);
  }

  const result: RegistryCheckResult = {
    modelName,
    existsOnOllama,
    existsOnHuggingFace,
    isCustom: !existsOnOllama && !existsOnHuggingFace,
    checkedAt: new Date().toISOString(),
  };

  cache.set(modelName, { result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}

export function clearRegistryCache(): void {
  cache.clear();
}

export function getRegistryCacheSize(): number {
  return cache.size;
}
