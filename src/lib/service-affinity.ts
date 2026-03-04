// Service affinity analysis: find services that might benefit from a new model
// Pure functions, no DB access -- fully testable

export interface SourceModelUsage {
  source: string;
  model: string;
  requestCount: number;
}

export interface ServiceAffinity {
  source: string;
  currentModel: string;
  requestCount: number;
  familyMatch: string;
}

export interface ModelFamilyInfo {
  family: string | null;
  families: string[];
}

/**
 * Build a model-name-to-family map.
 * Uses discovery data first, then falls back to base-name parsing.
 */
export function buildModelFamilyMap(
  discoveryFamilies: Array<{ modelName: string; modelFamily: string | null; families: string[] }>
): Map<string, ModelFamilyInfo> {
  const map = new Map<string, ModelFamilyInfo>();

  for (const d of discoveryFamilies) {
    map.set(d.modelName, { family: d.modelFamily, families: d.families });
  }

  return map;
}

/**
 * Parse a model name to extract its base family name.
 * "qwen3:8b" -> "qwen3", "llama3.2:70b-instruct" -> "llama3.2"
 */
export function parseBaseFamily(modelName: string): string {
  // Strip tag
  const base = modelName.split(":")[0];
  // Strip common suffixes like -instruct, -chat, -coder etc
  return base.replace(/-(?:instruct|chat|coder|vision|embed).*$/i, "");
}

/**
 * Check if two family sets overlap, using both exact and prefix matching.
 * Returns the matching family name, or null if no match.
 */
export function findFamilyOverlap(
  discoveryFamilies: string[],
  discoveryFamily: string | null,
  targetFamilies: string[],
  targetFamily: string | null
): string | null {
  // Build combined family sets
  const dFamilies = new Set(discoveryFamilies);
  if (discoveryFamily) dFamilies.add(discoveryFamily);

  const tFamilies = new Set(targetFamilies);
  if (targetFamily) tFamilies.add(targetFamily);

  // Exact match check
  for (const df of dFamilies) {
    if (tFamilies.has(df)) return df;
  }

  // Prefix matching: "qwen3.5" starts with "qwen3" or vice versa
  for (const df of dFamilies) {
    for (const tf of tFamilies) {
      if (df.startsWith(tf) || tf.startsWith(df)) {
        return tf.length > df.length ? df : tf;
      }
    }
  }

  return null;
}

/**
 * Find services that use models from the same family as a discovery.
 * Pure function: takes all data as arguments.
 */
export function findServiceAffinities(
  discoveryFamily: string | null,
  discoveryFamilies: string[],
  discoveryModelName: string,
  usageData: SourceModelUsage[],
  familyMap: Map<string, ModelFamilyInfo>
): ServiceAffinity[] {
  const affinities: ServiceAffinity[] = [];

  for (const usage of usageData) {
    // Skip if the usage is for the exact same model
    if (usage.model === discoveryModelName) continue;

    // Look up the used model's family info
    let targetInfo = familyMap.get(usage.model);

    // Fallback: parse base family from the model name itself
    if (!targetInfo) {
      const baseFamily = parseBaseFamily(usage.model);
      targetInfo = { family: baseFamily, families: [baseFamily] };
    }

    const match = findFamilyOverlap(
      discoveryFamilies,
      discoveryFamily,
      targetInfo.families,
      targetInfo.family
    );

    if (match) {
      affinities.push({
        source: usage.source,
        currentModel: usage.model,
        requestCount: usage.requestCount,
        familyMatch: match,
      });
    }
  }

  // Sort by request count descending
  affinities.sort((a, b) => b.requestCount - a.requestCount);

  return affinities;
}
