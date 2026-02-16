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
