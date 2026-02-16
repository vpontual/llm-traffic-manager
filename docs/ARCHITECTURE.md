# Architecture

Ollama Fleet Manager runs two parallel processes inside a single Docker container, backed by PostgreSQL.

## Components

### Next.js Dashboard (Port 3000)

Web UI for fleet monitoring and analytics. Uses SWR for real-time updates.

Pages:
- `/` - Dashboard with server cards, VRAM usage, loaded models, system metrics
- `/history` - Usage history, model event timeline, request audit log
- `/schedule` - Scheduled job management with conflict detection and timeline view

API routes in `src/app/api/` serve data from PostgreSQL.

### HTTP Proxy Server (Port 11434)

Standalone Node.js server built with esbuild (`src/proxy/server.ts`). Routes Ollama API requests using the algorithm in `src/proxy/router.ts`:

1. Server with model already loaded in memory (fastest)
2. Server with model downloaded to disk (no download needed)
3. Server with most free VRAM, round-robin tiebreaker (will need to pull the model)

Also aggregates `/api/tags`, `/api/ps`, and `/v1/models` responses from all servers, so clients see the full fleet as a single Ollama instance.

### Polling Service

Started via Next.js instrumentation (`src/instrumentation.ts`). Runs every `POLL_INTERVAL` seconds (default 10):

- Fetches Ollama status (health, version, running models, available models)
- Fetches system metrics from fleet-metrics agent on port 9100 (temps, CPU/GPU %, memory, disk)
- Detects model load/unload events by diffing snapshots between polls
- Detects server offline/online transitions and unexpected reboots
- Sends Telegram alerts with 30-minute cooldowns per server per alert type
- Auto-cleans data older than 7 days

### Telegram Alerts

Triggered after each poll cycle. Alert conditions:

- **Server offline** - Ollama stops responding
- **GPU overheating** - >= 90C
- **CPU overheating** - >= 85C
- **Disk nearly full** - >= 90% used
- **Low memory** - available < 10% of total
- **Unexpected reboot** - new boot detected via `recent_boots` diff

### Database (PostgreSQL 17)

Schema defined in `src/lib/schema.ts` using Drizzle ORM:

- **servers** - Server configuration (name, host, RAM)
- **serverSnapshots** - Periodic state snapshots (models, VRAM)
- **modelEvents** - Load/unload events for timeline
- **systemMetrics** - Hardware metrics (CPU/GPU temp, CPU/GPU utilization %, memory, disk)
- **requestLogs** - Proxy request audit log
- **scheduledJobs** - Cron job schedules for conflict detection
- **serverEvents** - Online/offline/reboot events
- **users** - Multi-user authentication
- **userTelegramConfigs** - Per-user Telegram notification settings
- **userServerSubscriptions** - Per-user server event subscriptions

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS, Recharts, SWR
- **Backend**: Node.js 22, PostgreSQL 17, Drizzle ORM
- **Build**: esbuild (proxy bundling)
- **Infrastructure**: Docker, Docker Compose
