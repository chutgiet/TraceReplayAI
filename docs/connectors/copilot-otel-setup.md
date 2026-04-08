# Copilot OpenTelemetry Setup — TraceReplay AI

> Capture VS Code Copilot Chat agent telemetry (LLM calls, tool executions, token usage) via OpenTelemetry and feed it into the TraceReplay audit pipeline.

## Prerequisites

- Docker Compose stack running (`docker compose up`)
- VS Code with GitHub Copilot Chat extension
- Copilot Chat OTel support (built-in to VS Code)

## Quick start

### 1. Start the stack (includes OTel Collector)

```bash
docker compose up -d
```

This starts all services including:
- **OTel Collector** on ports `4317` (gRPC) and `4318` (HTTP)
- **Ingest API** on port `3001`
- **Ollama** on port `11434` (for background post-processing)

### 2. Enable Copilot OTel export

The workspace `.vscode/settings.json` already has OTel enabled. If you need to configure manually:

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.exporterType": "otlp-http",
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4318",
  "github.copilot.chat.otel.captureContent": true
}
```

Or via environment variables (takes precedence over settings):

```bash
export COPILOT_OTEL_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export COPILOT_OTEL_CAPTURE_CONTENT=true
export OTEL_RESOURCE_ATTRIBUTES="team.id=tracereplay,project=tracereplay-ai"
```

### 3. Use Copilot Chat normally

Every agent interaction now emits OTel traces:
- `invoke_agent` spans (full agent orchestration)
- `chat` spans (LLM API calls with token counts)
- `execute_tool` spans (tool invocations with timing)

### 4. View captured traces

Open the TraceReplay web UI at `http://localhost:3000` and browse runs.

## Architecture

```
VS Code Copilot Chat
  │ OTel (OTLP HTTP :4318)
  ▼
OTel Collector (Docker)
  │ batch + forward
  ▼
Ingest API (:3001)
  │ POST /v1/traces
  ▼
Normalizer (OTelSpanAdapter)
  │ GenAI spans → canonical events
  ▼
Event Store (PostgreSQL)
  │
  ├──→ Ollama Processor (DeepSeek R1) — background enrichment
  │      • Run summaries
  │      • Anomaly detection
  │      • Compliance scanning
  │
  └──→ Replay / Lineage / Evidence / Web UI
```

## What gets captured

### Traces (span tree per agent interaction)

| Span | Maps to | Key data |
|------|---------|----------|
| `invoke_agent` | `run.start` + `run.end` | Agent name, conversation ID, turn count, total tokens |
| `chat` | `model.request` + `model.response` | Model ID, token counts, response time, finish reason |
| `execute_tool` | `tool.call.start` + `tool.call.end` | Tool name, duration, success status |

### Metrics

| Metric | Description |
|--------|-------------|
| `gen_ai.client.operation.duration` | LLM API call duration |
| `gen_ai.client.token.usage` | Token counts (input/output) |
| `copilot_chat.tool.call.count` | Tool invocations by name |
| `copilot_chat.tool.call.duration` | Tool execution latency |
| `copilot_chat.agent.invocation.duration` | Agent end-to-end duration |
| `copilot_chat.time_to_first_token` | Time to first SSE token |

### Events

| Event | Maps to |
|-------|---------|
| `copilot_chat.session.start` | `run.start` |
| `copilot_chat.tool.call` | `tool.call.start` / `tool.call.end` |
| `copilot_chat.agent.turn` | `annotation` (turn metadata) |

## Configuration options

### Option A: Via OTel Collector (recommended)

Traces flow: **Copilot → OTel Collector (:4318) → Ingest API (:3001)**

Best for production — collector handles batching, retry, memory limits.

### Option B: Direct to ingest-api

Traces flow: **Copilot → Ingest API (:3001) directly**

```json
{
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:3001"
}
```

Simpler but no batching/retry from collector.

### Option C: With Jaeger (for debugging)

Add Jaeger to see traces visually alongside TraceReplay:

```bash
docker run -d --name jaeger -p 16686:16686 -p 4318:4318 jaegertracing/jaeger:latest
```

## Content capture

By default, only metadata is captured (model names, token counts, durations). To capture full prompts and responses:

```json
{
  "github.copilot.chat.otel.captureContent": true
}
```

> **Caution:** Content capture includes code, file contents, and user prompts. Only enable in trusted environments.

## Ollama post-processing

When Ollama is running (Docker or local), captured traces are automatically enriched:

- **Run summaries** — AI-generated summary of what each agent session accomplished
- **Anomaly detection** — Flags unusual patterns (excessive failures, abnormal token usage)
- **Compliance scanning** — Checks for potential policy violations

### Using local Ollama (already installed)

If DeepSeek is already on your machine:

```bash
# Verify it's running
curl http://localhost:11434/api/tags

# The Docker services will auto-detect local Ollama via host.docker.internal
```

### Using Docker Ollama

```bash
# Pull the model after first start
docker compose exec ollama ollama pull deepseek-r1:14b
```

## Combining with MCP server

For maximum coverage, use **both** OTel capture and the MCP server:

1. **OTel** captures Copilot's internal reasoning, LLM calls, and native tool executions
2. **MCP server** captures TraceReplay-specific tool calls with full parameters and side effects

Together they provide a complete audit trail of every agent interaction.

## Troubleshooting

### No traces appearing

1. Check OTel is enabled: `"github.copilot.chat.otel.enabled": true`
2. Verify collector is running: `docker compose ps otel-collector`
3. Check collector logs: `docker compose logs otel-collector`
4. Test endpoint: `curl -X POST http://localhost:4318/v1/traces -H "Content-Type: application/json" -d '{}'`

### Ollama not processing

1. Verify Ollama is running: `curl http://localhost:11434/api/tags`
2. Check model is pulled: `ollama list` should show `deepseek-r1:14b`
3. Check worker logs: `docker compose logs worker`
