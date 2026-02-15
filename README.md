# Ollama Fleet Manager

[![CI](https://github.com/vpontual/ollamaproxy/actions/workflows/ci.yml/badge.svg)](https://github.com/vpontual/ollamaproxy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)

A dashboard and intelligent proxy for managing a fleet of [Ollama](https://ollama.com) GPU servers. Monitor server status, route requests to the best available server, track usage analytics, and schedule model operations — all from a single interface.

Built for anyone running multiple Ollama instances across different machines who wants centralized management without the complexity.

## Features

- **Real-time Fleet Monitoring** — Live dashboard showing server status, loaded models, VRAM usage, and system metrics
- **Intelligent Request Routing** — Automatically routes requests to the best available server:
  1. Server with model already loaded (fastest)
  2. Server with model on disk (no download needed)
  3. Server with most free VRAM (round-robin tiebreaker)
- **Request Aggregation** — Combines `/api/tags`, `/api/ps`, and `/v1/models` responses from all servers
- **Usage Analytics** — Track model load times, duration, and frequency
- **Event Timeline** — Visual timeline of model load/unload events
- **System Metrics** — CPU/GPU temperature, memory, disk, and uptime monitoring
- **Request Audit Log** — Logs all proxy requests with latency metrics
- **Scheduled Jobs** — Cron-based model scheduling with conflict detection
- **Auto-Discovery** — Discover cron jobs from Docker containers via environment variables
- **Multi-User Auth** — Cookie-based sessions with per-user Telegram notification preferences
- **Telegram Alerts** — Server offline/online, overheating, low memory, and reboot notifications
- **OpenAI API Compatible** — Supports `/v1/*` endpoints

## Architecture

The application runs two parallel processes inside a single container:

- **Next.js Dashboard (Port 3000)** — Web UI for fleet monitoring and analytics
- **HTTP Proxy Server (Port 11434)** — Routes Ollama API requests to the best available server

A background polling service periodically fetches server status and system metrics, storing snapshots in PostgreSQL for historical analysis.

## Quick Start

### Docker (Recommended)

```bash
# Clone the repo
git clone https://github.com/vpontual/ollamaproxy.git
cd ollamaproxy

# Copy and configure environment
cp .env.example .env
# Edit .env with your Ollama server addresses

# Start services
docker compose up -d
```

Access the dashboard at **http://localhost:3334**. On first visit you'll be prompted to create an admin account.

The proxy is available at **http://localhost:11434** — point your Ollama clients here instead of a single server.

### Manual Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run database migrations
npm run db:migrate

# Build the application
npm run build

# Start both servers
npm run start &
npm run proxy &
```

## Configuration

Create a `.env` file (or copy from `.env.example`):

```env
# Ollama servers to monitor and route to (JSON array)
OLLAMA_SERVERS='[
  {"name": "GPU Server 1", "host": "192.168.1.100:11434", "ramGb": 16},
  {"name": "GPU Server 2", "host": "192.168.1.101:11434", "ramGb": 24}
]'

# PostgreSQL connection string
DATABASE_URL=postgresql://ollama_fleet:password@db:5432/ollama_fleet

# Polling interval in seconds (default: 10)
POLL_INTERVAL=10

# Admin credentials (seeds first user on initial setup)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme

# Telegram notifications (optional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Source name mapping (optional): IP -> friendly name for request logs
SOURCE_NAMES='{"172.28.0.1": "my-app"}'
```

### System Metrics (Optional)

To display CPU/GPU temperature, memory, and disk metrics, install the lightweight metrics agent on each Ollama server. See the `fleet-metrics` directory for setup instructions.

## Ports

| Port | Service |
|------|---------|
| 3000 | Dashboard (3334 via Docker) |
| 11434 | Proxy Server |
| 5432 | PostgreSQL (5434 via Docker) |

## API Endpoints

### Dashboard API

- `GET /api/servers` — Server status with metrics
- `GET /api/events?hours=24` — Model load/unload events
- `GET /api/requests?hours=24` — Proxy request logs
- `GET /api/usage?hours=168` — Model usage statistics
- `POST /api/poll` — Trigger manual polling

### Scheduled Jobs API

- `GET /api/scheduled-jobs` — List all scheduled jobs
- `POST /api/scheduled-jobs` — Create a new job
- `PUT /api/scheduled-jobs/:id` — Update a job
- `DELETE /api/scheduled-jobs/:id` — Delete a job
- `GET /api/scheduled-jobs/timeline?hours=24` — Get timeline with conflicts
- `GET /api/scheduled-jobs/suggestions?model=X&durationMs=Y` — Find open time slots
- `GET /api/scheduled-jobs/discover` — Discover jobs from Docker containers
- `POST /api/scheduled-jobs/discover` — Discover and import jobs

### Proxy (Port 11434)

All standard Ollama API endpoints are supported. The proxy transparently routes requests to the best available server.

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS, Recharts, SWR
- **Backend**: Node.js 22, PostgreSQL 17, Drizzle ORM
- **Build**: esbuild (proxy bundling)
- **Infrastructure**: Docker, Docker Compose

## Testing

```bash
# Run all checks (lint + typecheck + unit tests)
npm run check

# Individual commands
npm run lint
npm run typecheck
npm test

# Smoke test against running Docker stack
npm run smoke:docker
```

Pre-commit hooks run `npm run check` automatically. See [`TESTING.md`](./TESTING.md) for full details.

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

## License

[MIT](LICENSE)
