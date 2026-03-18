# API Reference

All dashboard API endpoints require authentication (session cookie). The proxy endpoints are unauthenticated by default but support optional API key identification.

## Dashboard API

### Servers

- `GET /api/servers` - Server status with latest metrics and loaded models

### Events and Logs

- `GET /api/events?hours=24` - Model load/unload events
- `GET /api/requests?hours=24` - Proxy request audit log
- `GET /api/usage?hours=168` - Model usage statistics (load times, duration, frequency)
- `GET /api/server-events?hours=24` - Server online/offline/reboot events

### System

- `GET /api/plugins` - List installed plugins
- `GET /api/system-metrics?serverId=1&hours=24` - Historical system metrics for a server
- `GET /api/analytics?hours=24` - Routing quality and performance analytics
- `POST /api/poll` - Trigger manual polling cycle

### Scheduled Jobs

- `GET /api/scheduled-jobs` - List all scheduled jobs
- `POST /api/scheduled-jobs` - Create a new job
- `PUT /api/scheduled-jobs/:id` - Update a job
- `DELETE /api/scheduled-jobs/:id` - Delete a job
- `GET /api/scheduled-jobs/timeline?hours=24` - Timeline with conflict detection
- `GET /api/scheduled-jobs/suggestions?model=X&durationMs=Y` - Find open time slots
- `GET /api/scheduled-jobs/discover` - Discover cron jobs from Docker containers
- `POST /api/scheduled-jobs/discover` - Import discovered jobs

### User Management

- `GET /api/users` - List all users (admin only)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `POST /api/users/:id/api-key` - Generate API key for proxy identification

### Authentication

- `POST /api/auth/login` - Log in
- `POST /api/auth/logout` - Log out
- `GET /api/auth/me` - Get current session user
- `POST /api/auth/setup` - Create initial admin account (first-run only)

### Settings

- `GET /api/settings/telegram` - Get Telegram config for current user
- `PUT /api/settings/telegram` - Update Telegram config
- `GET /api/settings/subscriptions` - Get server event subscriptions
- `PUT /api/settings/subscriptions` - Update subscriptions

## Proxy API (Port 11434)

All standard [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md) endpoints are supported. The proxy transparently routes requests to the best available server.

### Identification Headers (Optional)

- `X-Ollama-Api-Key` - API key for request attribution in audit logs
- `X-Ollama-Source` - Service name for request attribution
- `X-Ollama-Pin-Server` - Force routing to a specific server by name

### Aggregated Endpoints

These endpoints combine responses from all online servers:

- `GET /api/tags` - All available models across the fleet
- `GET /api/ps` - All currently loaded models across the fleet
- `GET /v1/models` - OpenAI-compatible model list from all servers

### Retry Behavior

Read operations (`/api/generate`, `/api/chat`, `/api/embed`, `/v1/chat/completions`, `/v1/embeddings`) retry on a different server if the first returns a 404 (model not found). Write operations (`/api/pull`, `/api/create`, `/api/copy`, `/api/delete`) do not retry.

### OpenAI-Compatible Endpoint (`/v1/chat/completions`)

All `/v1/chat/completions` requests are automatically converted to Ollama's native `/api/chat` format before being forwarded to backend servers. Responses are converted back to OpenAI format (including SSE streaming).

This conversion is handled by `src/proxy/v1-compat.ts` and solves five compatibility problems between the OpenAI API format and Ollama's native API:

#### 1. Thinking model control

The `think` field is forwarded to the backend, allowing clients to disable reasoning output from models like Qwen3.5 and GLM that default to thinking mode:

```json
{
  "model": "qwen3.5:35b",
  "messages": [{"role": "user", "content": "hello"}],
  "think": false
}
```

Without this, thinking models return a `reasoning` field alongside empty `content`, which breaks most OpenAI-compatible clients.

#### 2. Ollama options passthrough

The `options` object is forwarded to control Ollama-specific parameters like context window size:

```json
{
  "model": "qwen3.5:35b",
  "messages": [{"role": "user", "content": "hello"}],
  "think": false,
  "options": {
    "num_ctx": 65536,
    "temperature": 0.7
  }
}
```

Standard OpenAI parameters (`temperature`, `max_tokens`, `top_p`, `stop`, `tools`) are also translated to their Ollama equivalents.

#### 3. Message format translation

OpenAI and Ollama use different formats for messages. The proxy automatically converts:

- **Array content**: OpenAI allows `content` as `[{"type": "text", "text": "..."}]`. Ollama requires a plain string. The proxy flattens array content automatically.
- **Tool calls**: OpenAI assistant messages include `id`, `type`, and JSON-string `arguments` in tool_calls. Ollama expects only `function.name` and object `arguments`. The proxy strips the extra fields and parses the arguments.
- **Tool messages**: OpenAI includes `tool_call_id` on tool-role messages. Ollama does not use this field. The proxy removes it.

This means any OpenAI-compatible client (OpenCode, Continue, Cursor, AI SDK apps, etc.) can use the proxy without modification, even with multi-turn conversations that include tool use.

#### 4. Streaming tool call spec compliance

Ollama's OpenAI-compatible API omits the `index` field on streamed tool call deltas, which is required by the OpenAI specification. The proxy adds the correct `index` to each tool call in both streaming and non-streaming responses, ensuring compatibility with clients that validate strictly against the spec (e.g. OpenCode).

The proxy also tracks whether tool calls were emitted during a streaming response. When the final chunk arrives, it uses this to set `finish_reason: "tool_calls"` instead of `"stop"`, which is necessary for agentic clients to know they should process the tool calls and continue the conversation loop.

#### 5. Top-level Ollama parameter passthrough

In addition to the nested `options` object, Ollama-native parameters can be sent at the top level of the request body. This is useful for clients like OpenCode that include parameters such as `num_ctx` at the top level rather than nested inside `options`:



Supported top-level parameters: `num_ctx`, `num_gpu`, `num_thread`, `num_keep`, `num_batch`, `repeat_penalty`, `repeat_last_n`, `mirostat`, `mirostat_tau`, `mirostat_eta`, `penalize_newline`, `num_predict`, `tfs_z`, `typical_p`, `min_p`, `top_k`. These are merged into the native `options` object, with explicitly nested `options` values taking precedence.
