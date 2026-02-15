import http from "node:http";
import {
  routeModel,
  pickAnyServer,
  getAllOnlineServers,
  resolveServerByName,
} from "./router";
import { db } from "../lib/db";
import { requestLogs, users } from "../lib/schema";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const PROXY_PORT = 11434;

// Endpoints where we extract a model field from the request body
const MODEL_ENDPOINTS = new Set([
  "/api/generate",
  "/api/chat",
  "/api/embed",
  "/api/embeddings",
  "/api/show",
  "/api/pull",
  "/api/delete",
  "/api/copy",
  "/api/create",
  "/v1/chat/completions",
  "/v1/completions",
  "/v1/embeddings",
]);

// Endpoints where we aggregate responses from all servers
const AGGREGATE_ENDPOINTS = new Set(["/api/tags", "/api/ps", "/v1/models"]);

// --- API Key cache for user identification ---
let apiKeyCache = new Map<string, { userId: number; username: string }>();
let lastKeyRefresh = 0;
const KEY_CACHE_TTL_MS = 30000; // 30 seconds

async function refreshApiKeyCache() {
  const now = Date.now();
  if (now - lastKeyRefresh < KEY_CACHE_TTL_MS) return;

  try {
    const allUsers = await db
      .select({ id: users.id, username: users.username, apiKey: users.apiKey })
      .from(users);

    const newCache = new Map<string, { userId: number; username: string }>();
    for (const u of allUsers) {
      newCache.set(u.apiKey, { userId: u.id, username: u.username });
    }
    apiKeyCache = newCache;
    lastKeyRefresh = now;
  } catch {
    // On error, keep old cache
  }
}

/**
 * Parse SOURCE_NAMES env var: JSON object mapping IP -> friendly name.
 */
function loadSourceNames(): Map<string, string> {
  const raw = process.env.SOURCE_NAMES;
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed));
  } catch {
    console.warn("Failed to parse SOURCE_NAMES env var, ignoring");
    return new Map();
  }
}

const sourceNames = loadSourceNames();

/**
 * Resolve a human-friendly source identifier from the incoming request.
 *
 * Priority:
 *   1. X-Ollama-Api-Key header (user identification)
 *   2. X-Ollama-Source header (services self-identify)
 *   3. SOURCE_NAMES env mapping for the IP
 *   4. Cleaned IP (strip ::ffff: IPv4-mapped prefix)
 */
function getSourceIdentifier(req: http.IncomingMessage): { source: string; userId: number | null } {
  // 1. API key header — user identification
  const apiKeyHeader = req.headers["x-ollama-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) {
    const user = apiKeyCache.get(apiKeyHeader.trim());
    if (user) {
      return { source: user.username, userId: user.userId };
    }
    // Invalid key — fall through to other methods
  }

  // 2. Explicit header — services can self-identify
  const sourceHeader = req.headers["x-ollama-source"];
  if (typeof sourceHeader === "string" && sourceHeader.trim()) {
    return { source: sourceHeader.trim(), userId: null };
  }

  // Get the raw IP
  const forwarded = req.headers["x-forwarded-for"];
  let ip: string;
  if (typeof forwarded === "string") {
    ip = forwarded.split(",")[0].trim();
  } else {
    ip = req.socket.remoteAddress ?? "unknown";
  }

  // Strip ::ffff: IPv4-mapped IPv6 prefix
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  // 3. Check name mapping
  const name = sourceNames.get(ip);
  if (name) return { source: name, userId: null };

  // 4. Fall back to cleaned IP
  return { source: ip, userId: null };
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function extractModel(body: Buffer, path: string): string | null {
  try {
    const parsed = JSON.parse(body.toString());
    return parsed.model ?? parsed.name ?? null;
  } catch {
    return null;
  }
}

async function logRequest(
  sourceIp: string,
  userId: number | null,
  model: string | null,
  endpoint: string,
  method: string,
  targetServerId: number | null,
  targetHost: string | null,
  statusCode: number | null,
  durationMs: number
) {
  try {
    await db.insert(requestLogs).values({
      sourceIp,
      userId,
      model,
      endpoint,
      method,
      targetServerId,
      targetHost,
      statusCode,
      durationMs,
    });
  } catch (err) {
    console.error("Failed to log request:", err);
  }
}

/**
 * Proxy a request to a target Ollama server, streaming the response back.
 */
function proxyRequest(
  targetHost: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: Buffer
): Promise<number> {
  return new Promise((resolve, reject) => {
    const [host, port] = targetHost.split(":");
    const options: http.RequestOptions = {
      hostname: host,
      port: parseInt(port || "11434", 10),
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: targetHost,
        "content-length": Buffer.byteLength(body).toString(),
      },
      timeout: 300000, // 5 min timeout for long generations
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
      proxyRes.pipe(res);
      proxyRes.on("end", () => resolve(proxyRes.statusCode ?? 500));
      proxyRes.on("error", reject);
    });

    proxyReq.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(JSON.stringify({ error: `proxy error: ${err.message}` }));
      }
      resolve(502);
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504);
        res.end(JSON.stringify({ error: "upstream timeout" }));
      }
      resolve(504);
    });

    proxyReq.write(body);
    proxyReq.end();
  });
}

/**
 * Aggregate /api/tags from all servers (deduplicated by model name).
 */
async function handleAggregateTags(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const onlineServers = await getAllOnlineServers();
  const allModels = new Map<string, unknown>();

  await Promise.all(
    onlineServers.map(async (server) => {
      try {
        const resp = await fetch(`http://${server.host}/api/tags`);
        const data = await resp.json();
        for (const model of data.models ?? []) {
          if (!allModels.has(model.name)) {
            allModels.set(model.name, model);
          }
        }
      } catch {
        // Server unreachable, skip
      }
    })
  );

  const result = { models: [...allModels.values()] };
  const body = JSON.stringify(result);
  res.writeHead(200, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body).toString(),
  });
  res.end(body);
}

/**
 * Aggregate /api/ps from all servers.
 */
async function handleAggregatePs(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const onlineServers = await getAllOnlineServers();
  const allModels: unknown[] = [];

  await Promise.all(
    onlineServers.map(async (server) => {
      try {
        const resp = await fetch(`http://${server.host}/api/ps`);
        const data = await resp.json();
        for (const model of data.models ?? []) {
          allModels.push({ ...model, _server: server.name, _host: server.host });
        }
      } catch {
        // Server unreachable, skip
      }
    })
  );

  const result = { models: allModels };
  const body = JSON.stringify(result);
  res.writeHead(200, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body).toString(),
  });
  res.end(body);
}

/**
 * Aggregate /v1/models from all servers (OpenAI compat).
 */
async function handleAggregateModels(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const onlineServers = await getAllOnlineServers();
  const seen = new Set<string>();
  const allModels: unknown[] = [];

  await Promise.all(
    onlineServers.map(async (server) => {
      try {
        const resp = await fetch(`http://${server.host}/v1/models`);
        const data = await resp.json();
        for (const model of data.data ?? []) {
          if (!seen.has(model.id)) {
            seen.add(model.id);
            allModels.push(model);
          }
        }
      } catch {
        // Skip
      }
    })
  );

  const result = { object: "list", data: allModels };
  const body = JSON.stringify(result);
  res.writeHead(200, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body).toString(),
  });
  res.end(body);
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const startTime = Date.now();

  // Refresh API key cache (cheap with TTL)
  await refreshApiKeyCache();

  const { source, userId } = getSourceIdentifier(req);
  const path = (req.url ?? "/").split("?")[0];
  const method = req.method ?? "GET";

  // Health check — respond directly
  if (path === "/" && method === "GET") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Ollama is running");
    return;
  }

  // Aggregate endpoints
  if (AGGREGATE_ENDPOINTS.has(path) && method === "GET") {
    try {
      if (path === "/api/tags") {
        await handleAggregateTags(req, res);
      } else if (path === "/api/ps") {
        await handleAggregatePs(req, res);
      } else if (path === "/v1/models") {
        await handleAggregateModels(req, res);
      }
      logRequest(source, userId, null, path, method, null, null, 200, Date.now() - startTime);
    } catch (err) {
      console.error(`Aggregate error for ${path}:`, err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: "internal proxy error" }));
      logRequest(source, userId, null, path, method, null, null, 500, Date.now() - startTime);
    }
    return;
  }

  // Read request body for POST/PUT/PATCH/DELETE
  let body: Buffer = Buffer.alloc(0) as Buffer;
  if (method !== "GET" && method !== "HEAD") {
    body = await readBody(req) as Buffer;
  }

  // Extract model from request body
  const model = MODEL_ENDPOINTS.has(path) ? extractModel(body, path) : null;

  // Route the request — honor X-Ollama-Pin-Server header if present
  const pinHeader = req.headers["x-ollama-pin-server"];
  const pinServerName = typeof pinHeader === "string" ? pinHeader.trim() : null;

  let route;
  if (pinServerName) {
    route = await resolveServerByName(pinServerName);
  }
  if (!route && model) {
    route = await routeModel(model);
  }
  if (!route) {
    route = await pickAnyServer();
  }

  if (!route) {
    res.writeHead(503);
    res.end(JSON.stringify({ error: "no online servers available" }));
    logRequest(source, userId, model, path, method, null, null, 503, Date.now() - startTime);
    return;
  }

  console.log(
    `[proxy] ${source} → ${route.serverName} (${route.host}) | ${method} ${path}${model ? ` | model=${model}` : ""} | reason=${route.reason}`
  );

  // Proxy the request
  const statusCode = await proxyRequest(route.host, req, res, body);
  const duration = Date.now() - startTime;

  // Log asynchronously (don't block response)
  logRequest(source, userId, model, path, method, route.serverId, route.host, statusCode, duration);
}

async function main() {
  console.log("Running database migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");

  if (sourceNames.size > 0) {
    console.log(`Source name mappings: ${[...sourceNames.entries()].map(([ip, name]) => `${ip}\u2192${name}`).join(", ")}`);
  }

  const server = http.createServer(handleRequest);

  server.listen(PROXY_PORT, () => {
    console.log(`Ollama proxy listening on port ${PROXY_PORT}`);
    console.log("Routing requests to Ollama fleet servers");
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("Shutting down proxy...");
    server.close(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    console.log("Shutting down proxy...");
    server.close(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("Proxy failed to start:", err);
  process.exit(1);
});
