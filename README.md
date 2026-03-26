# TraceReplay AI

> Audit-grade replay and lineage platform for enterprise AI agents using OpenTelemetry, Python, local Ollama models, and TypeScript.

TraceReplay AI captures prompts, context, tool calls, approvals, and downstream side effects from AI agent runs — then reconstructs them into replayable execution graphs for debugging, compliance, and incident investigation.

---

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose (for PostgreSQL and Redis)

### Setup

```bash
# Clone the repository
git clone https://github.com/chutgiet/TraceReplayAI.git && cd TraceReplayAI

# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL + Redis)
docker compose up -d

# Copy environment variables
cp .env.template .env

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Development

```bash
# Run all services in dev mode (uses Turborepo)
pnpm dev

# Run tests in watch mode
pnpm test -- --watch

# Type check all packages
pnpm typecheck
```

### Full stack with Docker Compose

Start **everything** — PostgreSQL, Redis, all backend services, and the web UI — with a single command:

```bash
# Production-like stack
docker compose up --build

# Or with hot-reload for development
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Convenience scripts are also available:

```bash
pnpm docker:up       # build & start all services
pnpm docker:dev      # build & start with hot-reload
pnpm docker:down     # stop all containers
pnpm docker:logs     # follow logs for all services
pnpm docker:reset    # destroy volumes (reset DB) and rebuild
```

| Service | URL | Description |
|---|---|---|
| Web UI | http://localhost:3000 | Next.js investigation & replay UI |
| Ingest API | http://localhost:3001 | `POST /v1/events`, `POST /v1/events/batch` |
| Query Service | http://localhost:3002 | `GET /v1/runs`, `/v1/events`, `/v1/search` |
| Normalizer | http://localhost:3003 | BullMQ worker (health: `/healthz`) |
| Worker | http://localhost:3004 | Async job runner (health: `/healthz`) |
| MCP Server | http://localhost:3005 | TraceReplay MCP server (SSE) or via stdio |
| PostgreSQL | localhost:5432 | Event store (user: `tracereplay`) |
| Redis | localhost:6379 | Job queue |

See [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md) for full setup documentation, troubleshooting, and common operations.

### Running individual services locally

For working on a specific service without Docker, start just the infrastructure containers and run services manually:

```bash
# 1. Start infrastructure (PostgreSQL + Redis)
docker compose up -d postgres redis

# 2. Set up environment variables (first time only)
cp .env.template .env
cp apps/web/.env.local.template apps/web/.env.local

# 3. Build all packages (required before first run)
pnpm build

# 4. Start the query-service backend (port 3002)
cd services/query-service && pnpm dev

# 5. In a separate terminal, start the Next.js web app (port 3000)
cd apps/web && pnpm dev

# 6. Open the UI
open http://localhost:3000
```

To stop everything:

```bash
# Stop the dev servers (Ctrl+C in each terminal), then:
docker compose down
```

---

## Repository structure

```
├── .ai/              — AI agent prompts, context, tasks, decisions
├── .github/          — GitHub config, CI/CD, Copilot instructions
├── apps/
│   └── web/          — Next.js investigation and replay UI
├── packages/
│   ├── event-schema/ — Canonical event types + Zod validators
│   ├── common/       — Shared utilities and constants
│   ├── replay-engine/— Timeline and causal replay construction
│   ├── sdk-typescript/— TypeScript ingestion SDK
│   ├── graph-model/  — Lineage graph data structures
│   ├── redaction/    — Field-level redaction engine
│   ├── connectors-core/— Base connector types
│   └── ui/           — Shared React components
├── services/
│   ├── ingest-api/   — REST API for event ingestion
│   ├── normalizer/   — Vendor telemetry → canonical events
│   ├── replay-service/— Serves replay timelines
│   ├── query-service/ — Investigation search API
│   ├── evidence-service/— Audit evidence generation
│   ├── tracereplay-mcp/— MCP server for AI agent session capture
│   └── worker/       — Async job processing
├── docs/             — Documentation
├── examples/         — Integration examples
├── tests/            — Integration, e2e, fixtures, performance
├── scripts/          — Build and development utilities
└── infrastructure/   — Docker, IaC, deployment configs
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    SDK / Adapters                   │
│  TypeScript SDK · Python SDK · OTel Exporter        │
│  OpenAI · Anthropic · Ollama models                 │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / gRPC
                       ▼
┌─────────────────────────────────────────────────────┐
│                    Ingest API                       │
│  Validates, deduplicates, queues raw events         │
└──────────────────────┬──────────────────────────────┘
                       │ Message Queue (BullMQ + Redis)
                       ▼
┌─────────────────────────────────────────────────────┐
│                    Normalizer                       │
│  Maps vendor telemetry → canonical event model      │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  Event Store                        │
│  Append-only canonical events + metadata            │
└──────┬──────────┬──────────┬────────────────────────┘
       │          │          │
       ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Replay  │ │ Lineage  │ │ Evidence │
│  Engine  │ │  Graph   │ │ Service  │
└──────────┘ └──────────┘ └──────────┘
       │          │          │
       ▼          ▼          ▼
┌─────────────────────────────────────────────────────┐
│                  Query Service                      │
│  Investigation API, search, filtering               │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                    Web UI                           │
│  Replay viewer, investigation, admin                │
└─────────────────────────────────────────────────────┘

┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│         TraceReplay MCP Server                      │
│  Instruments AI coding agent (Copilot, Codex,       │
│  Claude Code) tool calls in real time.              │
│  Transport: stdio (VS Code) or SSE (Docker)         │
│                                                     │
│  ┌──────────┐  emits telemetry   ┌────────────┐    │
│  │ AI Agent │ ──── MCP ────────► │ Ingest API │    │
│  └──────────┘  queries runs      ├────────────┤    │
│                ─────────────────► │Query Service│    │
│                                  └────────────┘    │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

See [.ai/context/architecture-overview.md](.ai/context/architecture-overview.md) for the full architecture documentation.

---

## Key concepts

| Concept | Description |
|---|---|
| **Run** | A single AI agent execution from start to finish |
| **Event** | An atomic unit of telemetry within a run |
| **Canonical model** | Stable internal schema all telemetry is normalized to |
| **Replay** | Reconstructing the execution timeline from stored events |
| **Lineage** | Causal graph of events, dependencies, and side effects |
| **Evidence** | Audit-ready bundle assembled from a run's events |
| **MCP Server** | Model Context Protocol server that instruments AI agent tool calls for audit-grade session capture |

---

## Tech stack

- **TypeScript** — Full stack
- **Fastify** — Backend API framework
- **Next.js + React + Tailwind** — Frontend
- **PostgreSQL** — Append-only event store
- **BullMQ + Redis** — Async job queue
- **MCP (Model Context Protocol)** — AI agent tool instrumentation
- **Ollama** — Local model inference (self-hosted LLMs)
- **pnpm + Turborepo** — Monorepo tooling
- **Vitest** — Testing
- **Zod** — Runtime schema validation

---

## For AI-assisted development

This repository is optimized for agentic AI development. See:

- [.ai/prompts/system.prompt.md](.ai/prompts/system.prompt.md) — Master engineering system prompt
- [.ai/context/](.ai/context/) — Product, architecture, event model, coding standards
- [.ai/tasks/](.ai/tasks/) — Sprint planning and backlog
- [.ai/decisions/](.ai/decisions/) — Architecture Decision Records

---

## License

See [LICENSE](LICENSE) for details.
