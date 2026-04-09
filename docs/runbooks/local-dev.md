# Local Development with Docker Compose

Run the full TraceReplay AI stack locally with a single command.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- Ports `3000–3006`, `4317–4318`, `5432`, `6379`, `11434` available

## Quick start

```bash
# Start the full stack (builds images on first run)
docker compose up --build

# Or start detached
docker compose up -d --build
```

Once healthy, the services are available at:

| Service | URL | Description |
|---------|-----|-------------|
| **Web UI** | http://localhost:3000 | Investigation & replay frontend |
| **Ingest API** | http://localhost:3001 | `POST /v1/events`, `POST /v1/events/batch`, `POST /v1/traces` (OTLP) |
| **Query Service** | http://localhost:3002 | `GET /v1/runs`, `/v1/events`, `/v1/search` |
| **Normalizer** | http://localhost:3003 | Health: `GET /healthz`, stats: `GET /stats` |
| **Worker** | http://localhost:3004 | Health: `GET /healthz`, stats: `GET /stats` |
| **MCP Server** | http://localhost:3005 | SSE transport for AI agent telemetry capture |
| **Evidence Service** | http://localhost:3006 | Evidence bundle assembly and export |
| **OTel Collector** | http://localhost:4318 | OTLP HTTP receiver (also gRPC on `:4317`) |
| **OTel Health** | http://localhost:13133 | Collector health check |
| **OTel zPages** | http://localhost:55679/debug/tracez | Collector debug trace viewer |
| **Ollama** | http://localhost:11434 | Local LLM (DeepSeek R1) for background enrichment |
| **PostgreSQL** | localhost:5432 | User: `tracereplay` / Password: `tracereplay` |
| **Redis** | localhost:6379 | No password (development) |

## Development mode (hot-reload)

For active development with source file watching and hot-reload:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

This mounts your local source files into the containers so changes are picked up automatically via `tsx watch` (backend) and `next dev` (frontend).

## Common operations

### View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f ingest-api
docker compose logs -f web
```

### Restart a single service

```bash
docker compose restart query-service
```

### Stop everything

```bash
docker compose down
```

### Reset database (destroy all data)

```bash
docker compose down -v
docker compose up --build
```

### Run migrations manually

If you add new SQL migrations after the initial setup:

```bash
# From host (requires local Node.js + pnpm)
DATABASE_URL=postgresql://tracereplay:tracereplay@localhost:5432/tracereplay pnpm db:migrate

# Or exec into a running service container
docker compose exec ingest-api npx tsx /app/scripts/db-migrate.ts
```

### Connect to PostgreSQL

```bash
docker compose exec postgres psql -U tracereplay -d tracereplay
```

### Connect to Redis

```bash
docker compose exec redis redis-cli
```

## Health checks

All services expose `GET /healthz` endpoints. Docker Compose uses these to determine service readiness and dependency ordering.

Check service health:

```bash
docker compose ps
```

Expected output when healthy:

```
NAME                STATUS
postgres            running (healthy)
redis               running (healthy)
ingest-api          running (healthy)
query-service       running (healthy)
normalizer          running (healthy)
worker              running (healthy)
evidence-service    running (healthy)
tracereplay-mcp     running (healthy)
otel-collector      running (healthy)
ollama              running (healthy)
web                 running (healthy)
```

## OpenTelemetry Collector

The OTel Collector receives OTLP traces, metrics, and logs from VS Code Copilot (and other OTel-enabled AI agents) and forwards them to the Ingest API.

### Verify the collector is running

```bash
# Health check
curl http://localhost:13133/

# View active traces (zPages debug UI)
open http://localhost:55679/debug/tracez
```

### View collector logs

```bash
docker compose logs -f otel-collector
```

In dev mode (`docker-compose.dev.yml`), the debug exporter uses `detailed` verbosity — every received span/metric is printed to stdout.

### Enable VS Code Copilot OTel export

See [Copilot OTel Setup](../connectors/copilot-otel-setup.md) for full instructions. Quick version:

```json
// .vscode/settings.json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.exporterType": "otlp-http",
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4318",
  "github.copilot.chat.otel.captureContent": true
}
```

## Architecture overview

```
┌──────────────────────┐
│ VS Code Copilot Chat │
│ (OTel-enabled)       │
└──────────┬───────────┘
           │ OTLP HTTP (:4318)
           ▼
┌──────────────────────┐
│   OTel Collector     │──▶ zPages (:55679)
│   :4317 (gRPC)      │──▶ Health (:13133)
│   :4318 (HTTP)       │
└──────────┬───────────┘
           │ OTLP HTTP
           ▼
┌─────────┐     ┌─────────────┐     ┌───────────────┐
│   Web   │────▶│Query Service│────▶│  PostgreSQL    │
│ :3000   │     │   :3002     │     │    :5432       │
└─────────┘     └─────────────┘     └───────────────┘
                                           ▲
┌─────────────┐                            │
│ Ingest API  │────────────────────────────┤
│   :3001     │                            │
└──────┬──────┘                            │
       │ (BullMQ)                          │
       ▼                                   │
┌──────────┐    ┌─────────┐               │
│  Redis   │◀───│Normalizr│───────────────┘
│  :6379   │    │  :3003  │
└──────────┘    └─────────┘
       ▲
       │
┌──────┴──────┐
│   Worker    │───────────────────────────▶ PostgreSQL
│   :3004     │
└─────────────┘

┌──────────────────┐    ┌─────────────┐
│ TraceReplay MCP  │───▶│ Ingest API  │
│     :3005        │    └─────────────┘
└──────────────────┘

┌──────────────────┐
│     Ollama       │  (background enrichment)
│    :11434        │
└──────────────────┘
```

## Troubleshooting

### Port already in use

Stop any local processes using the required ports, or modify the port mappings in `docker-compose.yml`.

### Services failing to start

Check that postgres and redis are healthy first:

```bash
docker compose ps postgres redis
```

If postgres isn't healthy, check its logs:

```bash
docker compose logs postgres
```

### Database connection errors

Services depend on postgres being healthy before starting. If you see connection errors, the postgres container may not have finished initializing. Wait for the health check to pass or restart:

```bash
docker compose restart ingest-api query-service normalizer worker
```

### Rebuild after dependency changes

If you add new npm packages:

```bash
docker compose build --no-cache
docker compose up
```
