---
title: "Full Codebase Review — Consolidated Findings"
type: refactor
status: active
date: 2026-03-19
---

# Full Codebase Review — Consolidated Findings

6 specialized review agents analyzed every source file in the Ollama Fleet Manager. This document consolidates all findings, deduplicated and prioritized.

**Overall verdict:** Well-architected codebase with clean separation of pure/impure logic, consistent patterns, and good test coverage (227 tests). No structural rot. The main issues are: missing database indexes (performance), missing auth on many dashboard routes (security), dead code from partially-built features, and duplicated logic between alerts/poller/telegram.

---

## CRITICAL — Fix Immediately

### C1. Zero Database Indexes on All Time-Series Tables

**Found by:** Performance, Architecture

Every time-series table (`server_snapshots`, `request_logs`, `model_events`, `system_metrics`, `server_events`) has zero indexes beyond primary keys. Every dashboard query and every router cache refresh does full table scans. With 7 days of 10s polling, `server_snapshots` alone has ~300K rows.

**Fix:** Add a migration:

```sql
CREATE INDEX idx_server_snapshots_server_polled ON server_snapshots(server_id, polled_at DESC);
CREATE INDEX idx_request_logs_created ON request_logs(created_at);
CREATE INDEX idx_request_logs_model_created ON request_logs(model, created_at);
CREATE INDEX idx_model_events_occurred ON model_events(occurred_at);
CREATE INDEX idx_model_events_server_occurred ON model_events(server_id, occurred_at);
CREATE INDEX idx_system_metrics_server_polled ON system_metrics(server_id, polled_at);
CREATE INDEX idx_server_events_occurred ON server_events(occurred_at);
```

**Impact:** 10-100x faster dashboard queries, 5-10x faster router refresh, faster cleanup jobs.

### C2. N+1 Query in Router Hot Path

**Found by:** Performance, Architecture, TypeScript

`router.ts:80-104` — For each server, a separate `SELECT ... ORDER BY polled_at DESC LIMIT 1` query hits `server_snapshots`. With 5 servers = 6 sequential queries every 3 seconds.

**Fix:** Replace with single `DISTINCT ON (server_id)` query:

```sql
SELECT DISTINCT ON (server_id) *
FROM server_snapshots
WHERE server_id IN (...)
ORDER BY server_id, polled_at DESC;
```

### C3. Proxy Port 11434 Has No Authentication

**Found by:** Security

Any LAN client gets full proxy access — generate, pull, delete, copy. The `X-Ollama-Api-Key` header is used only for logging attribution, not access control. Invalid/missing keys fall through silently.

**Fix:** Add configurable auth gate (`PROXY_REQUIRE_AUTH=true` env var). At minimum require valid API key for write operations (`/api/pull`, `/api/delete`, `/api/copy`, `/api/create`).

### C4. Setup Endpoint Race Condition

**Found by:** Security

`/api/auth/setup` checks `isFirstUser()` then inserts — not atomic. Two simultaneous requests can both create admin accounts.

**Fix:** Use `INSERT ... ON CONFLICT` or wrap in transaction with advisory lock.

### C5. Dead Code — `waitForServerSlot` / `getQueueLength` Will Crash If Called

**Found by:** TypeScript, Simplicity, Patterns

`router.ts:46-63` exports two functions that call `busyTracker.waitForSlot()` and `busyTracker.getQueueLength()` — neither method exists on `BusyRequestTracker`. Currently dead code, but a ticking time bomb.

**Fix:** Delete lines 46-63 from `router.ts`. Also delete `getBusyServerIds()` from `busy-tracker.ts` (never called — router uses `getFullServerIds` instead).

---

## HIGH — Fix Soon

### H1. 13+ Dashboard API Routes Missing Server-Side Auth

**Found by:** Security, Patterns

These routes lack `withAuth`/`withAdmin` wrappers and rely only on middleware cookie-existence check (which doesn't validate against DB):

| Route | Risk |
|-------|------|
| `GET /api/servers` | Exposes server IPs, RAM, models |
| `GET /api/requests` | Exposes all proxy request logs |
| `GET /api/analytics` | Exposes usage analytics |
| `GET /api/system-metrics` | Exposes CPU/GPU temps, memory |
| `GET /api/usage` | Exposes model usage data |
| `GET /api/discoveries` | Exposes fleet model inventory |
| `GET /api/recommendations` | Exposes infrastructure recommendations |
| `GET /api/server-events` | Exposes server lifecycle events |
| `GET /api/plugins` | Exposes plugin manifests |
| `POST /api/poll` | Triggers polling (side effect!) |
| `GET/POST /api/scheduled-jobs` | Read AND create jobs |
| `GET/PUT/DELETE /api/scheduled-jobs/[id]` | Modify/delete jobs |
| `GET/POST /api/scheduled-jobs/discover` | Reads Docker socket env vars! |

**Fix:** Wrap all routes in `withAuth` (reads) or `withAdmin` (mutations).

### H2. No Request Body Size Limit on Proxy

**Found by:** Security, Performance

`server.ts:173-179` — `readBody()` buffers entire request with no size limit. OOM DoS with a multi-GB request body.

**Fix:** Add `MAX_BODY_SIZE` check (e.g., 100MB), reject with 413.

### H3. `refreshApiKeyCache()` Blocks Every Request

**Found by:** Performance

`server.ts:459` — Awaited in the hot path of every request. When TTL expires, the unlucky request waits for a DB query.

**Fix:** Move to `setInterval` background refresh. No request should ever wait for a DB query for user identity.

### H4. Alert Threshold Logic Duplicated

**Found by:** Simplicity, Patterns, Architecture

`alerts.ts:39-73` reimplements every threshold check that `alert-rules.ts:evaluateMetrics()` already encapsulates. The pure function exists, is tested, but is never called in production.

**Fix:** Refactor `checkServerAlerts` to call `evaluateMetrics()` internally. ~30 lines removed from `alerts.ts`.

### H5. Reboot Detection Duplicated

**Found by:** Simplicity, Architecture

Both `poller.ts:302-345` and `alerts.ts:76-92` independently maintain boot-list Maps and diff them. Same detection, two code paths.

**Fix:** Remove reboot detection from `alerts.ts` (16 lines). Poller already handles it.

---

## MEDIUM — Address in Next Sprint

### M1. Telegram Send Logic Duplicated 4x

**Found by:** Patterns, Architecture

Four locations implement the same `fetch` to `api.telegram.org/bot.../sendMessage`:
- `telegram.ts:14-35` (`sendTelegramMessage`)
- `telegram.ts:37-58` (`sendTelegramReply` — never imported, dead code)
- `user-notifications.ts:62-78` (`sendUserTelegram`)
- `settings/telegram/route.ts:46-52,77-84` (inline)

**Fix:** Create shared `sendToTelegramBot(botToken, chatId, text)`. Delete dead `sendTelegramReply`.

### M2. JSONB Columns Typed as `unknown[]`

**Found by:** TypeScript, Patterns

`schema.ts:34-35` types `loadedModels`/`availableModels` as `unknown[]`, forcing `as OllamaRunningModel[]` casts in 4+ files.

**Fix:** Use `.$type<OllamaRunningModel[]>()` on the schema column. Eliminates all downstream casts.

### M3. `any` Types in v1-compat.ts

**Found by:** TypeScript, Patterns

5 `any` usages in the OpenAI-to-Ollama conversion layer — the most complex module with zero tests.

**Fix:** Define `OpenAIMessage`, `OpenAIToolCall` interfaces. Add tests for `convertMessagesToNative`, `convertResponseToV1`, `createV1StreamTransform`.

### M4. No Rate Limiting Anywhere

**Found by:** Security

No rate limiting on login endpoint (brute-force risk), proxy port, or dashboard APIs.

**Fix:** At minimum, rate limit `/api/auth/login` (5 attempts/IP/minute). Consider upstream HAProxy rate limiting for the proxy.

### M5. No Security Headers

**Found by:** Security

No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, or `Referrer-Policy`.

**Fix:** Add headers in `next.config.ts`.

### M6. No CORS on Proxy Port

**Found by:** Security

Any webpage opened on a LAN browser can make requests to `http://<proxy>:11434/api/chat` — browser-based SSRF.

**Fix:** Add CORS headers restricting origins on the proxy.

### M7. `backendType` Cast Repeated in 3 Files

**Found by:** TypeScript

Schema column is `text` but used as union type. Cast scattered inconsistently.

**Fix:** Use `.$type<BackendType>()` on the schema column.

### M8. Schema `eventType` Columns Untyped

**Found by:** TypeScript, Patterns

`modelEvents.eventType`, `serverEvents.eventType`, `managementActions.action/status` are plain `text` but should be typed unions.

**Fix:** Add `.$type<"loaded" | "unloaded">()` etc.

### M9. Floating Promises on `logRequest`

**Found by:** TypeScript

`logRequest()` is async but never awaited (intentional fire-and-forget). Should be explicit with `void logRequest(...)` to signal intent.

### M10. Background Pull Missing `.catch()`

**Found by:** TypeScript, Patterns

`models/pull/route.ts:47` — `.then(async (result) => { await db.update(...) })` with no `.catch()`. DB update failure is unhandled.

**Fix:** Add `.catch(err => console.error(...))`.

### M11. System Metrics Endpoint Fetches All Rows Then Downsamples in JS

**Found by:** Performance

Fetches all rows in time window, keeps 1/6th. Should downsample in SQL with `DISTINCT ON (date_trunc('minute', polled_at))`.

### M12. `lastRoutedServer` Map Never Evicts

**Found by:** Architecture

`router.ts:25` — Every unique model name ever routed gets an entry. Grows unboundedly.

**Fix:** Add TTL or size cap (LRU).

---

## LOW — Cleanup When Convenient

### L1. Test Helper Duplication
`route-logic.test.ts` and `busy-tracker.test.ts` duplicate `makeServer`, `loadedModel`, `availableModel`. Extract to `tests/unit/helpers.ts`.

### L2. Three Aggregate Handlers Nearly Identical
`server.ts:346-448` — `handleAggregateTags/Ps/Models` share identical structure. Extract generic `aggregateFromServers<T>()`.

### L3. Dead Code to Delete (~55 LOC)
- `sendTelegramReply` in `telegram.ts:37-58` (never imported)
- `clearRegistryCache` / `getRegistryCacheSize` in `registry-check.ts:92-98` (test-only)
- `isProduction` in `env.ts:40-42` (never used)
- `getBusyServerIds` in `busy-tracker.ts:21-23` (never called)

### L4. Duplicate JSDoc on `evictIdleModelsIfNeeded`
`router.ts:148-156` — stale duplicate comment block.

### L5. Over-Abstract Single-Line Modules
- `permissions.ts` — single boolean expression, inline into `route-helpers.ts`
- `validations/system-metrics.ts` — trivial wrapper, inline at call site

### L6. Poller Reads `OFFLINE_THRESHOLD` Env on Every Poll Cycle
`poller.ts:244` — Read once at startup instead.

### L7. `PROXY_PORT` Hardcoded
`server.ts:23` — Should be configurable via env var.

### L8. Proxy Error Messages Leak Internal Details
Server names, RAM sizes, error messages exposed to unauthenticated clients.

### L9. Poller Makes 4 HTTP Requests Per Server Per Cycle
Health check and version poll are redundant — derive health from ps/tags success. Saves 2 requests/server/cycle.

### L10. `requestLogs.sourceIp` Column Misnamed
Stores username/service name, not IP. Should be `source_identifier`.

### L11. Magic Numbers
Scattered timeout values and conflict window constants should be named.

### L12. Inconsistent Success Response Shape
Some routes use `{ ok: true }`, one uses `{ success: true, id }`. Pick one.

### L13. Duplicate Migration Call
Both `server.ts:654` and `instrumentation.ts:9` run migrations. Remove from proxy.

---

## Positive Findings (Things Done Right)

- **Pure/impure separation** — `route-logic.ts`, `alert-rules.ts`, `cron-utils.ts`, `oversized-models.ts`, `service-affinity.ts` are all pure functions. Excellent testability.
- **227 tests passing** with coverage gate (lines >= 90%, branches >= 85%, functions >= 95%).
- **Validation layer** — Consistent `ValidationResult<T>` pattern with Zod across all API routes.
- **No SQL injection** — Drizzle ORM with parameterized queries throughout.
- **No command injection** — No `exec`, `spawn`, `eval` anywhere.
- **Clean proxy/dashboard split** — Database as integration seam, separate build targets.
- **Event-driven architecture** — Poller diffs snapshots to detect model load/unload events.
- **Naming conventions** — Consistent kebab-case files, camelCase functions, PascalCase types, UPPER_SNAKE constants.
- **bcrypt password hashing** with 12 rounds.
- **Fire-and-forget logging** — `logRequest` doesn't block the proxy response path.

---

## Recommended Implementation Order

| Phase | Items | Effort | Impact |
|-------|-------|--------|--------|
| **1. Quick wins** | C5, L3, L4, L5 (delete dead code) | 30 min | Remove ~130 LOC of liability |
| **2. Database** | C1, C2 (indexes + N+1 fix) | 2 hours | 10-100x query improvement |
| **3. Security** | C3, C4, H1, H2, M4, M5, M6 | 4 hours | Close auth gaps, add safety limits |
| **4. Dedup** | H4, H5, M1 (alerts + reboot + telegram) | 2 hours | Single source of truth |
| **5. Type safety** | M2, M3, M7, M8 | 2 hours | Eliminate casts, add v1-compat tests |
| **6. Polish** | Everything in LOW | 2 hours | Cleanup |
