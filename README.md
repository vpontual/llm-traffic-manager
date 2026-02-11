# Ollama Fleet Manager

A dashboard and proxy server for monitoring and managing a fleet of Ollama GPU servers with intelligent request routing.

## Features

- **Real-time Fleet Monitoring** - Live dashboard showing server status, loaded models, and VRAM usage
- **Intelligent Request Routing** - Automatically routes requests to the best available server based on:
  1. Server with model already loaded (fastest)
  2. Server with model downloaded (no download needed)
  3. Server with most free VRAM (round-robin tiebreaker)
- **Request Aggregation** - Combines `/api/tags`, `/api/ps`, and `/v1/models` responses from all servers
- **Usage Analytics** - Track model load times, duration, and frequency
- **Event Timeline** - Visual timeline of model load/unload events
- **System Metrics** - CPU/GPU temperature, memory, disk, and uptime via Prometheus node exporter
- **Request Audit Log** - Logs all proxy requests with latency metrics
- **Scheduled Jobs** - Register cron schedules, visualize upcoming executions, detect conflicts
- **Auto-Discovery** - Discover cron jobs from Docker containers via environment variables
- **OpenAI API Compatible** - Supports `/v1/*` endpoints

## Architecture

The application runs two parallel processes:

- **Next.js Dashboard (Port 3000)** - Web UI for fleet monitoring and analytics
- **HTTP Proxy Server (Port 11434)** - Routes Ollama API requests to appropriate servers

A background polling service periodically fetches server status and system metrics, storing snapshots in PostgreSQL for historical analysis.

## Quick Start

### Docker (Recommended)

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your server configuration

# Start services
docker compose up -d
```

Access the dashboard at http://localhost:3334

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

Create a `.env` file with the following variables:

```env
# JSON array of Ollama servers to monitor
OLLAMA_SERVERS='[
  {"name": "Server 1", "host": "10.0.0.1:11434", "ramGb": 16},
  {"name": "Server 2", "host": "10.0.0.2:11434", "ramGb": 24}
]'

# PostgreSQL connection string
DATABASE_URL=postgresql://user:password@localhost:5432/ollama_fleet

# Polling interval in seconds (default: 10)
POLL_INTERVAL=10
```

### System Metrics (Optional)

To display CPU/GPU temperature, memory, and disk metrics, install [Prometheus Node Exporter](https://github.com/prometheus/node_exporter) on each Ollama server (port 9100).

## Ports

| Port | Service |
|------|---------|
| 3000 | Dashboard (3334 via Docker) |
| 11434 | Proxy Server |
| 5432 | PostgreSQL (5434 via Docker) |

## API Endpoints

### Dashboard API

- `GET /api/servers` - Server status with metrics
- `GET /api/events?hours=24` - Model load/unload events
- `GET /api/requests?hours=24` - Proxy request logs
- `GET /api/usage?hours=168` - Model usage statistics
- `POST /api/poll` - Trigger manual polling

### Scheduled Jobs API

- `GET /api/scheduled-jobs` - List all scheduled jobs
- `POST /api/scheduled-jobs` - Create a new job
- `PUT /api/scheduled-jobs/:id` - Update a job
- `DELETE /api/scheduled-jobs/:id` - Delete a job
- `GET /api/scheduled-jobs/timeline?hours=24` - Get timeline with conflicts
- `GET /api/scheduled-jobs/suggestions?model=X&durationMs=Y` - Find open time slots
- `GET /api/scheduled-jobs/discover` - Discover jobs from Docker containers
- `POST /api/scheduled-jobs/discover` - Discover and import jobs from Docker containers

### Proxy (Port 11434)

All standard Ollama API endpoints are supported. The proxy transparently routes requests to the best available server.

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS, Recharts, SWR
- **Backend**: Node.js, PostgreSQL, Drizzle ORM
- **Build**: esbuild (proxy bundling)
- **Infrastructure**: Docker, Docker Compose
