// Ollama API client -- health checks, model listings, server polling

import type {
  OllamaPsResponse,
  OllamaTagsResponse,
  OllamaVersionResponse,
} from "./types";

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(
  url: string,
  timeoutMs = TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkHealth(host: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`http://${host}/`);
    const text = await res.text();
    return text.includes("Ollama is running");
  } catch {
    return false;
  }
}

export async function getVersion(host: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`http://${host}/api/version`);
    const data: OllamaVersionResponse = await res.json();
    return data.version;
  } catch {
    return null;
  }
}

export async function getRunningModels(
  host: string
): Promise<OllamaPsResponse | null> {
  try {
    const res = await fetchWithTimeout(`http://${host}/api/ps`);
    return await res.json();
  } catch {
    return null;
  }
}

export async function getAvailableModels(
  host: string
): Promise<OllamaTagsResponse | null> {
  try {
    const res = await fetchWithTimeout(`http://${host}/api/tags`);
    return await res.json();
  } catch {
    return null;
  }
}

export async function pollServer(host: string) {
  const [isOnline, version, running, available] = await Promise.all([
    checkHealth(host),
    getVersion(host),
    getRunningModels(host),
    getAvailableModels(host),
  ]);

  return {
    isOnline,
    version,
    runningModels: running?.models ?? [],
    availableModels: available?.models ?? [],
  };
}

// --- vLLM backend polling ---

interface VllmModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

/**
 * Check vLLM health via /health, falling back to /v1/models.
 */
export async function checkHealthVllm(host: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`http://${host}/health`);
    if (res.ok) return true;
  } catch {
    // /health not available, try /v1/models
  }
  try {
    const res = await fetchWithTimeout(`http://${host}/v1/models`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch model list from vLLM /v1/models endpoint.
 */
export async function getVllmModels(host: string): Promise<VllmModel[]> {
  try {
    const res = await fetchWithTimeout(`http://${host}/v1/models`);
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Poll a vLLM server. Returns the same shape as pollServer().
 * vLLM models are always "loaded" (no lazy loading like Ollama).
 */
export async function pollVllmServer(host: string) {
  const [isOnline, models] = await Promise.all([
    checkHealthVllm(host),
    getVllmModels(host),
  ]);

  // Convert vLLM models to OllamaRunningModel shape (always loaded)
  const runningModels = models.map((m) => ({
    name: m.id,
    model: m.id,
    size: 0,
    digest: "",
    details: {
      parent_model: "",
      format: "vllm",
      family: "",
      families: [],
      parameter_size: "",
      quantization_level: "",
    },
    expires_at: new Date("2100-01-01").toISOString(), // vLLM models never expire
    size_vram: 0,
    context_length: 0,
  }));

  // vLLM models are both "loaded" and "available"
  const availableModels = models.map((m) => ({
    name: m.id,
    model: m.id,
    modified_at: new Date().toISOString(),
    size: 0,
    digest: "",
    details: {
      parent_model: "",
      format: "vllm",
      family: "",
      families: [],
      parameter_size: "",
      quantization_level: "",
    },
  }));

  return {
    isOnline,
    version: null,
    runningModels,
    availableModels,
  };
}

/**
 * Poll a generic server -- health check only, no model discovery.
 */
export async function pollGenericServer(host: string) {
  let isOnline = false;
  try {
    const res = await fetchWithTimeout(`http://${host}/health`);
    isOnline = res.ok;
  } catch {
    // Try root path as fallback
    try {
      const res = await fetchWithTimeout(`http://${host}/`);
      isOnline = res.ok;
    } catch {
      isOnline = false;
    }
  }

  return {
    isOnline,
    version: null,
    runningModels: [],
    availableModels: [],
  };
}
