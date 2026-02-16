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
