// Pure parsing functions for model info -- no network calls, fully testable

// --- Types ---

export interface OllamaComInfo {
  description: string | null;
  capabilities: string[];
  pullCount: string | null;
}

export interface RegistryInfo {
  modelFamily: string | null;
  families: string[];
  modelType: string | null;
  fileType: string | null;
}

export interface ModelInfo {
  ollamaCom: OllamaComInfo | null;
  registry: RegistryInfo | null;
  registryExists: boolean;
}

// --- Capability detection patterns ---

const CAPABILITY_PATTERNS: Array<{ keyword: RegExp; tag: string }> = [
  { keyword: /\btools?\b/i, tag: "tools" },
  { keyword: /\bvision\b/i, tag: "vision" },
  { keyword: /\bthink(?:ing)?\b/i, tag: "thinking" },
  { keyword: /\bembed(?:ding)?\b/i, tag: "embedding" },
  { keyword: /\bcode\b/i, tag: "code" },
];

// --- ollama.com HTML parsing (pure, testable) ---

export function parseOllamaComHtml(html: string): OllamaComInfo {
  // Extract description from <meta name="description" content="...">
  let description: string | null = null;
  const metaMatch = html.match(
    /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
  );
  if (metaMatch) {
    description = metaMatch[1].trim() || null;
  }

  // Detect capabilities from badge/tag elements in the HTML
  const capabilities: string[] = [];
  for (const { keyword, tag } of CAPABILITY_PATTERNS) {
    const badgePattern = new RegExp(
      `(?:<span[^>]*class="[^"]*(?:badge|tag|pill|label)[^"]*"[^>]*>[^<]*${keyword.source}[^<]*</span>|<a[^>]*href="/search\\?q=capability&c=${tag}"[^>]*>)`,
      "i"
    );
    if (badgePattern.test(html)) {
      capabilities.push(tag);
    }
  }

  // Fallback: check the meta description for capability keywords
  if (capabilities.length === 0 && description) {
    for (const { keyword, tag } of CAPABILITY_PATTERNS) {
      if (keyword.test(description)) {
        capabilities.push(tag);
      }
    }
  }

  // Extract pull count
  let pullCount: string | null = null;
  const pullMatch = html.match(
    /(?:<span[^>]*>)?\s*([\d.]+[KMB]?)\s*(?:Pulls|pulls)\s*(?:<\/span>)?/
  );
  if (pullMatch) {
    pullCount = pullMatch[1];
  }

  return { description, capabilities, pullCount };
}

/** Determine info_fetch_status based on what succeeded */
export function getInfoFetchStatus(info: ModelInfo): "success" | "partial" | "failed" {
  const hasOllama = info.ollamaCom !== null;
  const hasRegistry = info.registry !== null;

  if (hasOllama && hasRegistry) return "success";
  if (hasOllama || hasRegistry) return "partial";
  return "failed";
}
