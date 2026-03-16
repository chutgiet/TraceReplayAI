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
cp .env.example .env

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Development

```bash
# Run all services in dev mode
pnpm dev

# Run tests in watch mode
pnpm test -- --watch

# Type check all packages
pnpm typecheck
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
│  OpenAI · Anthropic · Ollama models.                │
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

---

## Tech stack

- **TypeScript** — Full stack
- **Fastify** — Backend API framework
- **Next.js + React + Tailwind** — Frontend
- **PostgreSQL** — Append-only event store
- **BullMQ + Redis** — Async job queue
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
