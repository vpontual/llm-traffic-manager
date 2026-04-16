# vLLM Migration — Plan for llm-traffic-manager

**Date:** 2026-04-16
**Author:** Claude Code session (vp)
**Status:** Ready to execute — answers to all open questions locked in §5.

## 1. Summary

DGX Spark (10.0.154.246) will transition from Ollama to vLLM to get better throughput on that hardware. The other three fleet nodes (Orin AGX, Jetson Nano 1, Jetson Nano 2) stay on Ollama. The traffic manager must make this change **invisible to every upstream client** — newsfeed, trackacrypto, constitutional, Llama Rider, and any future consumer — regardless of whether they use Ollama-native (`/api/*`) or OpenAI-compatible (`/v1/*`) endpoints.

The migration is architectural (new translation path), then operational (the admin physically swaps Ollama for vLLM on DGX). Rollback is "reinstall Ollama on DGX, flip the DB entry back" — manual but unambiguous.

## 2. The non-negotiable constraint

> "All calls from various services can be ignorant to the fact that one of the AI servers is vllm and not ollama."

This rules out the approach of "clients must move to `/v1/*`". Ollama-native `/api/generate` and `/api/chat` requests **must** be able to land on a vLLM backend. The translation happens in the proxy.

## 3. Architectural invariants

These rules apply anywhere in the code that touches backend selection or forwarding.

### 3.1 Route before translate

Request parsing and route selection complete **before** any backend-specific transformation runs. The chosen server's backend type drives the transformation — not the incoming path.

Flow:
1. Read body, extract model name.
2. `selectRoute()` chooses a server (filtered by endpoint compatibility + model advertisement + size fit for Ollama).
3. Based on `route.backendType`, the request adapter rewrites path + body.
4. Response adapter wraps the response stream/buffer back into the client's expected shape.

This fixes a latent bug in today's code where `v1-compat.ts` runs before routing on the assumption the target is Ollama — an assumption that breaks when vLLM joins the fleet.

### 3.2 Proxy is read-only against vLLM

- Proxy **observes** vLLM via `/v1/models`, `/health`, and the fleet-metrics agent.
- Proxy **never commands** vLLM: no warmup, no unload, no pull, no keep_alive injection, no model-load triggering.
- Admin controls vLLM's served model by stopping and starting the process with a different `--served-model-name`. On the next poll (10s), the proxy picks up the new model name automatically and routing follows. No proxy-side config update required when swapping the model.

### 3.3 Model advertisement is the sole vLLM routability check

- For vLLM entries, a server is a valid route target for model X iff its current `/v1/models` response contains X. Binary.
- Size-based filtering (shipped in `0ea8c0a`) applies only to Ollama entries. vLLM can't dynamic-load, so "could fit if it tried" has no meaning.

### 3.4 Null metadata over fake zeros

`pollVllmServer` today writes `size: 0`, `size_vram: 0`, `context_length: 0`. Change to `null` for all three. Widen the relevant types.

### 3.5 Specific-model requests never go to servers that don't advertise the model

The size filter enforces this by coincidence today. Make it an explicit rule in `selectRoute` so intent is clear and future refactors don't lose it.

### 3.6 Translate, don't route-away

For every pair `(client endpoint, backend type)`:

| Client endpoint | → Ollama backend | → vLLM backend |
|---|---|---|
| `/api/generate` | passthrough | translate to `/v1/completions` |
| `/api/chat` | passthrough | translate to `/v1/chat/completions` |
| `/api/embeddings`, `/api/embed` | passthrough | translate to `/v1/embeddings` if served |
| `/v1/chat/completions` | convert to `/api/chat` (existing code, but run after routing) | passthrough |
| `/v1/completions` | convert to `/api/generate` | passthrough |
| `/v1/embeddings` | convert to `/api/embed` if supported | passthrough |
| `/v1/models` | aggregated across fleet | aggregated across fleet |
| `/api/tags`, `/api/ps` | aggregated across fleet | include vLLM entries with null metadata where unknown |
| `/api/pull`, `/api/create`, `/api/copy`, `/api/delete`, `/api/push` | passthrough | excluded by route filter; 400 if no Ollama server has the model |

### 3.7 Model identity

vLLM must launch with `--served-model-name` set to the exact name the Ollama fleet uses (`qwen3.5:35b`). Document as a deployment requirement. The proxy trusts `/v1/models` and uses those IDs as the logical model names for routing.

## 4. What we are NOT doing

- **No BackendAdapter interface refactor.** Clean long-term; too much diff for a one-time migration. Revisit if/when we add a third backend type.
- **No schema rename** (`ollamaVersion` → `serverVersion`, etc.). Cosmetic churn mid-migration; the nullability change is what actually matters.
- **No new env var** (`LLM_SERVERS`). The existing `OLLAMA_SERVERS` already accepts a `backendType` per entry.
- **No side-by-side / gradual rollout.** Admin owns the DGX transition physically; service interruption during the swap is acceptable.
- **No capability limiting.** vLLM context window is full native (qwen3.5:35b supports up to 128k); no artificial cap.

## 5. Decisions locked in

1. **Shape:** single vLLM process on DGX serving one pinned model. Multiple vLLM processes is a future option but not part of this migration.
2. **Port:** 8000 (vLLM default).
3. **Tool calling:** enabled. Launch flags determined at Phase 2 (e.g. `--enable-auto-tool-choice --tool-call-parser hermes` for qwen family, exact parser string TBD at launch).
4. **Context window:** `--max-model-len` set to the model's native max (128k for qwen3.5:35b). No artificial cap.
5. **Cutover:** admin handles the physical swap (shut down DGX, install vLLM, bring it back up). Service interruption during the swap is accepted. No side-by-side.
6. **Size filter for vLLM:** n/a — advertisement check alone is the gatekeeper.

## 6. Current state (verified against commit `0ea8c0a`)

Works:
- `backendType` column exists with `ollama | vllm | generic`.
- `pollVllmServer` hits `/v1/models` and synthesizes Ollama-shaped lists.
- `v1-compat.ts` converts client `/v1/chat/completions` → Ollama `/api/chat` (but runs before routing — see §3.1).
- Size-based routing filter excludes undersized servers unless the model is already loaded there.

Missing:
- No `/api/*` → `/v1/*` translation in the proxy.
- No reverse response translation (OpenAI-shape JSON + SSE → Ollama-shape JSON + NDJSON).
- `pollVllmServer` writes fake zeros for size/vram/context.
- Route filter (`route-logic.ts:102`) excludes vLLM from all `/api/*` traffic.
- `v1-compat` conversion runs before routing, not after.

## 7. Phased plan

### Phase 1 — Translation layer (code only, deploys while DGX is still Ollama)

Zero behavior change while all servers remain `backendType=ollama`. New code paths are dormant until a vLLM server enters the fleet.

**Files changed:**

- **New** `src/proxy/vllm-adapter.ts`:
  - `adaptRequestOllamaToVllm(path, body) → { path, body }`:
    - `/api/generate` → `/v1/completions`: map `prompt`, `stream`, `options.temperature` → `temperature`, `options.top_p`/`top_k`, `options.num_predict` → `max_tokens`. Drop `keep_alive`, `options.num_ctx`, `think`.
    - `/api/chat` → `/v1/chat/completions`: same option mapping. Messages pass through. Tool definitions pass through (Ollama uses OpenAI shape). Stringify `tool_calls[].function.arguments` in historical messages (Ollama stores object, OpenAI expects string).
    - `/api/embeddings`, `/api/embed` → `/v1/embeddings`.
  - `adaptResponseVllmToOllama(path, body, { startedAt }) → body`:
    - `/v1/completions` response → `{response, done, done_reason, eval_count, prompt_eval_count, total_duration}`. Durations in nanoseconds; synthesize total from wall time.
    - `/v1/chat/completions` response → `{message: {role, content, tool_calls}, done, done_reason, ...}`. Parse `tool_calls[].function.arguments` string → object for Ollama clients.
    - `/v1/embeddings` response → Ollama `/api/embed` shape.
  - `createVllmToOllamaStreamTransform(path, { startedAt })`: SSE reader that emits Ollama NDJSON. Handles `data: {...}\n\n` framing, `[DONE]` sentinel, translates `delta.content` → `response` (generate) or `message.content` (chat), emits final done-frame with timings.

- **`src/proxy/route-logic.ts`:**
  - Remove the blanket `/api/*` → ollama-only filter.
  - New rule: `/api/pull|create|copy|delete|push` → ollama-only (management endpoints).
  - Everything else: backend-neutral.
  - Add explicit `advertisesModel(server, modelName)` gate before each tier (§3.5).
  - Size filter applies only when `server.backendType === "ollama"` (§3.3).

- **`src/proxy/server.ts`:**
  - Reorder: extract model name from body, route, then dispatch to backend adapter.
  - When `route.backendType === "vllm"`: use `adaptRequestOllamaToVllm` + `adaptResponseVllmToOllama` (or stream transform).
  - Skip `ensureModelLoaded` for vLLM (always loaded).
  - Skip `evictIdleModelsIfNeeded` for vLLM (can't).
  - Skip `keep_alive` injection for vLLM. One-time log line per server when we first drop keep_alive, so the fact is visible.

- **`src/lib/schema.ts`:**
  - Widen `OllamaRunningModel` and `OllamaAvailableModel` fields to `number | null` for `size`, `size_vram`, `context_length`.
  - No DB migration (JSONB accepts looser shape).

- **`src/lib/ollama.ts`:**
  - `pollVllmServer` writes `null` for unknown numeric fields.

- **Dashboard (`src/components/*`, `src/app/api/servers/*`):**
  - Render `—` for null VRAM/size instead of `0 GB`.
  - Backend badge ("Ollama" / "vLLM") on each server card.

- **Aggregation handlers (`server.ts`):**
  - `handleAggregateTags` includes vLLM entries.
  - `handleAggregatePs` includes vLLM entries with null VRAM/size, synthesized "always loaded" state.
  - `handleAggregateModels` already works.

- **`src/proxy/v1-compat.ts`:**
  - Keep the conversion logic, but invoke it from `server.ts` AFTER routing, only when `route.backendType === "ollama"`.

- **Package/README/CLAUDE.md:**
  - Document the vLLM deployment requirements: `--served-model-name` matching the Ollama-fleet name, `--max-model-len` (native), tool flags.

**Tests:**

- `tests/unit/vllm-adapter.test.ts` (new, 15-25 tests):
  - Request: generate/chat/embeddings × with/without options × with/without tools × streaming flag.
  - Response: non-stream generate, non-stream chat, streaming (fixture-based). Tool-call round-trip.
  - Edge: empty `choices`, missing `usage`, malformed chunks mid-stream, mid-stream abort.
- `tests/unit/route-logic.test.ts` additions:
  - `/api/chat` on a fleet of mixed ollama+vllm servers.
  - `/api/pull` excluded from vLLM pool even if the vLLM server advertises the model.
  - Size filter skipped for vLLM entries.
  - Named-model request never reaches a non-advertising server.
- `scripts/stress.mjs` gains `MODE_FILTER` env var (e.g. `MODE_FILTER=vllm` to only route through vLLM servers). Stays polite, still default 3 workers.

**Deploy:** lint + typecheck + full test green. Deploy. Smoke-check that existing Ollama traffic is unchanged for at least 2 hours (watch newsfeed, trackacrypto, Llama Rider).

**Rollback:** revert the commit, redeploy. No state to unwind.

### Phase 2 — User performs the DGX swap

Admin-owned operation. **Service interruption during this window is accepted.**

Admin steps (for reference, not for me to execute):
1. Shut down DGX.
2. Clean up Ollama installation on DGX.
3. Install vLLM.
4. Launch vLLM with approximately:
   ```
   vllm serve <qwen3.5:35b checkpoint path> \
     --served-model-name qwen3.5:35b \
     --max-model-len <native max> \
     --gpu-memory-utilization 0.9 \
     --enable-auto-tool-choice \
     --tool-call-parser hermes \
     --host 0.0.0.0 --port 8000
   ```
   (Exact checkpoint path and parser string TBD; see §9.)
5. Bring DGX back up.

Then in the traffic-manager dashboard:
6. Edit the DGX Spark server entry: `backendType: ollama → vllm`, `host: 10.0.154.246:11434 → 10.0.154.246:8000`.
7. Save.

The next poll cycle (≤10s) picks up the vLLM `/v1/models` response. Routing starts sending qwen3.5:35b requests to vLLM via the new adapter path.

### Phase 3 — Verification checklist (admin-run, ~15 min)

Immediately after the DB edit in Phase 2:

- [ ] Dashboard shows DGX Spark as online, backend badge reads "vLLM", model list shows exactly `qwen3.5:35b`.
- [ ] `curl -s http://localhost:11434/api/tags | jq` returns a list including `qwen3.5:35b`.
- [ ] `curl -s http://localhost:11434/api/ps | jq` shows DGX with `qwen3.5:35b` loaded (synthesized always-loaded state).
- [ ] `curl -s http://localhost:11434/v1/models | jq` shows `qwen3.5:35b` among the entries.
- [ ] A minimal `/api/generate` request against the proxy for `qwen3.5:35b` returns an Ollama-shaped response with a non-empty `response` string.
- [ ] A minimal `/api/chat` request returns a correctly-shaped `message` object.
- [ ] A `/api/chat` request with a tool definition successfully returns a `tool_calls` array (if Llama Rider has a handy test tool).
- [ ] A streaming `/api/generate` request produces valid NDJSON chunks ending in `{"done": true, ...}`.
- [ ] `npm run stress -- MODELS=qwen3.5:35b` reports 100% success rate.
- [ ] Proxy log's `[health-summary]` after 5min shows `auto-released-total=0`.
- [ ] Newsfeed logs show successful summarizations on its next poll.
- [ ] trackacrypto, constitutional, Llama Rider continue operating.

If anything fails: roll back per §8.

### Phase 4 — Cleanup

- Update `CLAUDE.md` and `docs/ARCHITECTURE.md` to reflect DGX is vLLM.
- Update memory (`ollama-fleet-routing.md`) to reflect the new topology.
- Keep the old DGX Ollama config artifacts archived somewhere local (admin's choice) in case of rollback.

### Phase 5 — Optional future cleanup (not part of this migration)

Only if a third backend type is ever added:
- Introduce `BackendAdapter` interface as the alternative plan suggested.
- Rename types backend-neutral (`serverVersion`, `LoadedModel`, `AvailableModel`).
- Consider `LLM_SERVERS` env var alongside `OLLAMA_SERVERS`.

Also defer-able:
- Raising `--max-model-len` beyond native default, if that ever becomes relevant.
- Running multiple vLLM processes on DGX (Shape B).

### Phase 6 — Dashboard-driven vLLM model switching (follow-on feature)

**Goal:** admin can swap the model that DGX's vLLM process serves from the traffic-manager dashboard, without SSHing to DGX.

**Depends on:** Phase 1-4 complete and stable (vLLM proven in production).

**Architecture sketch:**

1. **New agent on DGX** (parallel to the existing fleet-metrics agent):
   - HTTP server, e.g. `/opt/vllm-control/vllm_control.py` on port 9101.
   - `GET /models-available` returns a list of HF repo IDs cached on disk (scans `~/.cache/huggingface/hub/` or reads a configured allowlist).
   - `GET /current` returns the currently-served model name.
   - `POST /switch { model: "..." }` triggers a vLLM restart with the new `--model` and `--served-model-name`. Returns a job ID; progress queryable via `GET /switch/:jobId`.
   - Runs as the user that owns the vLLM systemd unit, uses `systemctl --user restart vllm@<model>.service` or similar via a drop-in config file that the agent rewrites before restart.
   - Shared bearer token with the proxy (env var on both sides).

2. **Proxy API additions:**
   - `GET /api/servers/:id/vllm/models` → proxies to agent `/models-available`.
   - `POST /api/servers/:id/vllm/switch` → proxies to agent `/switch`, requires admin auth.
   - `GET /api/servers/:id/vllm/switch/:jobId` → proxies to agent progress.

3. **Dashboard UI:**
   - On the DGX server card: a "Switch model" button (admin-only).
   - Modal: dropdown of available models, confirm button, disclaimer that the switch takes 30-120s and interrupts in-flight requests.
   - Progress indicator while the switch runs.
   - On success: card updates automatically (next poll picks up the new model).
   - On failure: toast with the error from the agent.

**Open design questions (to settle before Phase 6 starts):**

- **Drain policy:** when the admin clicks switch, do in-flight requests (a) get aborted, (b) wait up to N seconds for natural completion then abort, or (c) block the switch until the queue is empty?
- **Discovery:** scan disk cache vs explicit allowlist? Disk scan is live but may surface junk checkpoints; allowlist is curated but needs config maintenance.
- **Failure recovery:** if the new model fails to load, does the agent fall back to the previous model, or leave vLLM down with an error state?
- **Concurrency:** if two admins click switch at once (unlikely here, but…), serialize via the agent; return 409 on the second request.
- **Auth:** reuse the existing dashboard session for the proxy→agent path, or introduce a dedicated service token? Leaning toward service token (the agent doesn't need to know about dashboard sessions).

**Effort estimate:** half-day to a day of focused work, assuming auth model and discovery method are decided up front.

**Not in this migration's definition of done.** Admin uses SSH to swap models until Phase 6 lands.

## 8. Rollback strategy

At any point in Phase 2/3, if vLLM misbehaves:

1. In the dashboard, edit DGX Spark server entry: `backendType: vllm → ollama`, `host: 10.0.154.246:8000 → 10.0.154.246:11434`.
2. Stop vLLM on DGX.
3. Reinstall or restart Ollama on DGX.
4. Next poll picks up the Ollama fleet state. Routing resumes via the Ollama path.

Time to recover: as long as reinstalling Ollama takes (admin-bounded).

For Phase 1 rollback: `git revert <commit>` + redeploy. No state to reconcile.

## 9. Open items for the admin (resolved at Phase 2 execution time)

These don't block Phase 1 coding but need to be settled before Phase 2 launch:

1. **Exact qwen3.5:35b checkpoint** — HuggingFace repo ID or local path for vLLM's `--model` flag.
2. **Tool-call parser string** — `hermes` works for qwen 2.5 family; qwen3 may have its own parser in newer vLLM. Confirm based on vLLM version at launch.
3. **GPU memory utilization** — start at 0.9; tune if VRAM pressure shows up.
4. **`--max-num-seqs`** — concurrency tuning for vLLM. Default may be fine; stress-test in Phase 3.

## 10. Risks, ranked

1. **Streaming translation bugs.** SSE ↔ NDJSON bridge is the most error-prone part. Mitigation: fixture-based unit tests using captured real vLLM streams at Phase 3.
2. **Tool-call shape mismatch.** `tool_calls[].function.arguments` as string vs object is the canonical place Llama Rider could silently misbehave. Mitigation: dedicated tool-call test fixture; Phase 3 checklist includes a tool-call request.
3. **Silent `keep_alive` drop.** Newsfeed sends `keep_alive=30m`. On vLLM this is ignored (vLLM holds the model regardless). Expected behavior; logged once per server.
4. **Route-before-translate reorder regressions.** Current `/v1/chat/completions` handling has non-trivial logic. Mitigation: aggressive regression test suite in Phase 1 before any translation path is added.
5. **vLLM reports a model name that doesn't match.** If `--served-model-name` is forgotten, `/v1/models` returns the raw HF repo ID and routing by name breaks. Mitigation: Phase 3 checklist item #1.
6. **Concurrency tuning.** vLLM's `maxConcurrent` is different from Ollama's. Phase 3 stress run establishes a reasonable value.
7. **DGX is a single point of routing for qwen3.5:35b.** No other fleet node can fit the model. If DGX saturates, clients queue then 503. This is already true today with Ollama; listed for awareness.

## 11. Out of scope

- Multiple models per vLLM endpoint.
- Speculative decoding or other vLLM-specific tuning exposed through the proxy.
- Auto-scaling vLLM.
- vLLM model downloads managed from the dashboard.
- The `BackendAdapter` refactor.
- Renaming `OLLAMA_SERVERS` to `LLM_SERVERS`.
- Raising `--max-model-len` beyond native.

## 12. Definition of done

- All four clients (newsfeed, trackacrypto, constitutional, Llama Rider) continue to function unchanged, with no code or config updates required on their side.
- qwen3.5:35b requests land on vLLM DGX and complete successfully with expected quality.
- `/api/tags`, `/api/ps`, `/v1/models` all show accurate fleet state.
- Dashboard renders vLLM entries with correct badges and null-safe metadata.
- Stress harness reports 100% success across `{ollama, vllm} × {generate, chat} × {streaming, non-streaming}`.
- `[health-summary]` log shows `auto-released-total=0` for 24h after cutover.
- Memory and docs updated.
