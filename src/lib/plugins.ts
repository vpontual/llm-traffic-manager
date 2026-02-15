import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  type: "agent" | "hook";
  defaultPort?: number;
  endpoint?: string;
  configKey?: string;
}

const pluginRegistry: PluginManifest[] = [];

export function loadPlugins(): PluginManifest[] {
  pluginRegistry.length = 0;

  const pluginsDir = join(process.cwd(), "plugins");
  if (!existsSync(pluginsDir)) {
    console.log("No plugins directory found, skipping plugin load");
    return pluginRegistry;
  }

  const entries = readdirSync(pluginsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = join(pluginsDir, entry.name, "plugin.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const raw = readFileSync(manifestPath, "utf-8");
      const manifest: PluginManifest = JSON.parse(raw);

      if (!manifest.name || !manifest.type) {
        console.warn(`[Plugins] Invalid manifest in ${entry.name}, skipping`);
        continue;
      }

      pluginRegistry.push(manifest);
      console.log(`[Plugins] Loaded: ${manifest.name} v${manifest.version} (${manifest.type})`);
    } catch (err) {
      console.warn(`[Plugins] Failed to load ${entry.name}:`, err);
    }
  }

  return pluginRegistry;
}

export function getAgentPlugins(): PluginManifest[] {
  return pluginRegistry.filter((p) => p.type === "agent");
}

export function getPluginRegistry(): PluginManifest[] {
  return [...pluginRegistry];
}
