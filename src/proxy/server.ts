// Ollama-compatible HTTP proxy -- routes requests to the fleet,
// aggregates multi-server responses, and logs all traffic.

import http from "node:http";
import {
  routeModel,
  pickAnyServer,
  getAllOnlineServers,
  resolveServerByName,
  clearOptimisticLoad,
  getRecommendedPullServer,
} from "./router";
import { db } from "../lib/db";
import { requestLogs, users } from "../lib/schema";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readJsonEnv } from "../lib/env";
import { extractModel } from "./parse";
import { sendTelegramMessage } from "../lib/telegram";

const PROXY_PORT = 11434;

// Maximum number of servers to try before giving up on model-not-found retries
const MAX_ROUTE_RETRIES = 3;

// Debounce Telegram notifications per model (5 minutes)
const modelNotFoundNotified = new Map<string, number>();
const NOTIFY_DEBOUNCE_MS = 300000;

// --- Endpoint classification ---

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

// Endpoints where retry-on-model-not-found makes sense (read operations).
// Write operations (pull, create, copy, delete) should NOT retry — they route
// once and the target server handles the action.
const RETRY_ENDPOINTS = new Set([
  "/api/generate",
  "/api/chat",
  "/api/embed",
  "/api/embeddings",
  "/api/show",
  "/v1/chat/completions",
  "/v1/completions",
  "/v1/embeddings",
]);

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
  try {
    const parsed = readJsonEnv<Record<string, string>>("SOURCE_NAMES");
    if (!parsed) return new Map();
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


async function logRequest(
  sourceIp: string,
  userId: number | null,
  model: string | null,
  endpoint: string,
  method: string,
  targetServerId: number | null,
  targetHost: string | null,
  statusCode: number | null,
  durationMs: number,
  routingReason: string | null = null
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
      routingReason,
    });
  } catch (err) {
    console.error("Failed to log request:", err);
  }
}

interface ProxyResult {
  statusCode: number;
  retryable: boolean;
}

/**
 * Proxy a request to a target Ollama server, streaming the response back.
 *
 * When allowRetry is true, 404 responses are intercepted and checked for
 * "not found" in the body (Ollama's model-not-found pattern). If detected,
 * the response is NOT written to `res` and retryable is set to true so the
 * caller can re-route to a different server. Connection errors (ECONNREFUSED
 * etc.) are also retryable.
 */
function proxyRequest(
  targetHost: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: Buffer,
  allowRetry: boolean = false
): Promise<ProxyResult> {
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
      const statusCode = proxyRes.statusCode ?? 500;

      // In retry mode, intercept 404s to check for model-not-found
      if (allowRetry && statusCode === 404) {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString();
          if (responseBody.includes("not found")) {
            // Model not found — don't write to res, signal retry
            resolve({ statusCode, retryable: true });
          } else {
            // Some other 404 — forward to client
            res.writeHead(statusCode, proxyRes.headers);
            res.end(Buffer.concat(chunks));
            resolve({ statusCode, retryable: false });
          }
        });
        proxyRes.on("error", reject);
        return;
      }

      // Normal path — stream directly
      res.writeHead(statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      proxyRes.on("end", () => resolve({ statusCode, retryable: false }));
      proxyRes.on("error", reject);
    });

    proxyReq.on("error", (err) => {
      if (allowRetry) {
        // Connection error in retry mode — signal retry
        resolve({ statusCode: 502, retryable: true });
      } else {
        if (!res.headersSent) {
          res.writeHead(502);
          res.end(JSON.stringify({ error: `proxy error: ${err.message}` }));
        }
        resolve({ statusCode: 502, retryable: false });
      }
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504);
        res.end(JSON.stringify({ error: "upstream timeout" }));
      }
      resolve({ statusCode: 504, retryable: false });
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

// --- Main request handler ---

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
  let body: Buffer = Buffer.alloc(0);
  if (method !== "GET" && method !== "HEAD") {
    body = await readBody(req);
  }

  // Extract model from request body
  const model = MODEL_ENDPOINTS.has(path) ? extractModel(body) : null;

  // Route the request — honor X-Ollama-Pin-Server header if present
  const pinHeader = req.headers["x-ollama-pin-server"];
  const pinServerName = typeof pinHeader === "string" ? pinHeader.trim() : null;

  // Retry logic: if a server returns model-not-found or is unreachable,
  // exclude it and try the next best server. Only retry for model endpoints
  // without a pin header (pinned requests go where they're told).
  const canRetry = model != null && !pinServerName && RETRY_ENDPOINTS.has(path);
  const excludeServerIds: number[] = [];

  for (let attempt = 0; attempt <= MAX_ROUTE_RETRIES; attempt++) {
    let route;
    if (pinServerName) {
      route = await resolveServerByName(pinServerName);
    }
    if (!route && model) {
      route = await routeModel(model, excludeServerIds);
    }
    // If routeModel returned null after excluding servers, all candidates
    // are exhausted — don't fall back to pickAnyServer (it ignores exclusions)
    if (!route && excludeServerIds.length > 0) {
      break;
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
      `[proxy] ${source} → ${route.serverName} (${route.host}) | ${method} ${path}${model ? ` | model=${model}` : ""} | reason=${route.reason}${attempt > 0 ? ` | retry=${attempt}` : ""}`
    );

    // On the last attempt, don't allow retry — let the response flow to the
    // client even if it's an error, so they get a meaningful message.
    const allowRetry = canRetry && attempt < MAX_ROUTE_RETRIES;
    const result = await proxyRequest(route.host, req, res, body, allowRetry);

    if (result.retryable) {
      console.log(
        `[proxy] ${result.statusCode === 404 ? "Model not found" : "Server unreachable"} on ${route.serverName} (${route.host}), trying next server...`
      );
      excludeServerIds.push(route.serverId);
      clearOptimisticLoad(model!, route.serverId);
      continue;
    }

    // Success or non-retryable error — done
    const duration = Date.now() - startTime;
    logRequest(source, userId, model, path, method, route.serverId, route.host, result.statusCode, duration, route.reason);
    return;
  }

  // All candidate servers exhausted — return recommendation for pulling
  if (!res.headersSent) {
    const recommendation = model ? getRecommendedPullServer() : null;
    const responseBody: Record<string, unknown> = {
      error: model
        ? `model '${model}' not found on any available server`
        : "no online servers available",
    };

    if (model && recommendation) {
      responseBody.pull_recommendation = recommendation;
      responseBody.hint = `To download this model, POST /api/pull with {"model": "${model}"} — the proxy will route it to ${recommendation.serverName} (${recommendation.freeVramGb} GB free of ${recommendation.totalRamGb} GB)`;

      // Send debounced Telegram notification
      const lastNotified = modelNotFoundNotified.get(model) ?? 0;
      if (Date.now() - lastNotified > NOTIFY_DEBOUNCE_MS) {
        modelNotFoundNotified.set(model, Date.now());
        const loaded = recommendation.loadedModels.length > 0
          ? recommendation.loadedModels.join(", ")
          : "none";
        sendTelegramMessage(
          `⚠️ <b>Model not found</b>\n\n` +
          `Model: <code>${model}</code>\n` +
          `Requested by: ${source}\n` +
          `Best server: <b>${recommendation.serverName}</b> ` +
          `(${recommendation.freeVramGb} GB free of ${recommendation.totalRamGb} GB)\n` +
          `Currently loaded: ${loaded}\n\n` +
          `Reply /pull_missing to download it.`
        );
      }
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify(responseBody));
  }
  logRequest(source, userId, model, path, method, null, null, 404, Date.now() - startTime);
}

// --- Server startup ---

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
