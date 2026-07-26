# TraceReplay AI — Backlog

## Priority: CRITICAL (Sprint Interception-1 — ADR-0005) ⭐ CORE FEATURE

### Decision Ledger (record-only spine)
- [ ] Decision record event schema (`decision.recorded`, `workspace.snapshot`, `session.attestation`, `capture.gap`)
- [ ] Write-time hash chaining (`chain_hash` at persistence; evidence-service verifies stored chain)
- [ ] Configuration attestation (hash settings.json / hooks.json / config.toml at session start)
- [ ] Explicit gap markers for incomplete capture chains
- [ ] Durable local event spool (no silent telemetry loss)

### Ring 3 — Filesystem Ground Truth
- [ ] Git tree hash snapshots (incl. untracked) at session start + turn boundaries
- [ ] Diff hashes chained into ledger
- [ ] (Later) FSEvents/fanotify watcher for sub-turn granularity or out-of-workspace writes

### Ring 1 — Native Hooks
- [ ] Claude Code hook pack (PreToolUse/PostToolUse/PostToolUseFailure/SessionStart/Stop)
- [ ] Codex hook pack (bash-only) with honest limitation profile
- [ ] Hook payload adapter in connectors-core
- [ ] Deprecate parallel file/shell MCP tools (keep agent-facing API tools)

### Ring 2 — Transport Spine (Milestone 6)
- [ ] ADR-0006: MCP proxy architecture spike
- [ ] Egress HTTPS proxy spike (model I/O capture feasibility)
- [ ] MCP proxy build: stdio + Streamable HTTP forwarder, tool discovery passthrough
- [ ] Egress proxy build: local CA, HTTP(S)_PROXY, Codex `[features.network_proxy]`

### Deterministic Replay (Milestone 7 — the moat)
- [ ] Nondeterministic input capture: model I/O, retrieval results, tool outputs, clock reads, seeds
- [ ] Re-execution harness + divergence detection
- [ ] Evidence packs for compliance/legal buyer

### Enforcement (Milestone 8 — the switch)
- [ ] Policy gate at Ring 1 (PreToolUse deny) and Ring 2 (proxy block)
- [ ] Cedar/Rego compilation — no proprietary DSL
- [ ] Fail-closed local sidecar, sub-ms, no model in hot path
- [ ] Rule proposals from observed traffic
- [ ] Identity assertion consumption (APort passport, Entra Agent ID) — never issue

---

## Priority: High (paused Core-1 remainder — OTel + Ollama)

### OpenTelemetry Native Ingestion
- [x] OTel Collector service in Docker Compose (gRPC :4317, HTTP :4318)
- [x] OTLP HTTP receiver endpoint in ingest-api (`POST /v1/traces`)
- [x] OTel Span → canonical event adapter (`OTelSpanAdapter` in connectors-core)
- [x] VS Code Copilot OTel settings profile and documentation
- [ ] GenAI semantic convention full mapping (spans, metrics, events)
- [ ] OTLP metrics endpoint (`POST /v1/metrics`) + run_metrics table
- [ ] OTel context propagation in MCP server (superseded by Ring 2 design)
- [ ] Integration test: Copilot OTel → ingest → normalize → replay (carried into Interception-1 Tier 4)
- [ ] OTel adapter extensions for Codex/Claude (vendor auto-detection)

### Ollama Post-Processing Pipeline
- [x] Ollama processor service (DeepSeek R1 background enrichment)
- [ ] Ollama Docker integration (with host fallback)
- [ ] BullMQ enrichment queue (run-summary, anomaly-check, compliance-scan)
- [ ] Semantic tagging and event classification

---

## Foundation (complete except noted)

### Ingestion & Schema
- [x] Canonical event schema package with full type definitions
- [x] Zod runtime validators for all event types
- [x] Ingest API with schema validation and persistence
- [x] Idempotent ingestion (dedup by event ID)
- [x] Out-of-order event handling strategy
- [x] Batch ingestion endpoint

### Replay & Lineage
- [x] Basic replay engine: ordered timeline from events
- [x] Causal replay: parent-child event linking
- [x] Gap detection: identify missing spans in a run
- [x] Lineage graph model: run → events → side effects
- [x] Sub-agent run linking

### SDK
- [x] TypeScript SDK: lightweight event client
- [ ] Auto-instrumentation helpers for common patterns
- [x] OpenAI Agents SDK adapter
- [x] GitHub Copilot adapter
- [x] Claude Code adapter
- [ ] LangGraph/LangChain adapter

---

## Priority: Medium

### Investigation & Query
- [x] Query service: list runs, filter by status/agent/time
- [x] Full-text search across event payloads
- [x] Run timeline API for frontend consumption
- [x] Event detail API with redaction awareness

### Frontend
- [x] Next.js app scaffold
- [x] Run list page with filters
- [x] Run detail / replay timeline view
- [x] Event detail expandable panel
- [x] Basic lineage graph visualization
- [x] Shared UI component library

### Evidence & Compliance
- [x] Evidence bundle assembly from run data
- [x] JSON export format
- [x] PDF summary generation
- [x] Evidence integrity hash chain (retroactive — moves to write-time chaining in Interception-1)
- [x] Redaction engine with configurable rules

---

## Priority: Low (Future)

### Deferred from Core-1 sprint
- [ ] OTel Codex/Claude adapter extensions (vendor auto-detection, speculative)
- [ ] Auto-instrumentation helpers for SDK (SDK polish, not critical path)
- [ ] LangGraph/LangChain adapter (no OTel from LangChain yet)
- [ ] Evidence UI: bundle viewer and export controls (needs data flowing first)

### Enterprise
- [ ] Multi-tenant data isolation
- [ ] RBAC system (viewer, investigator, admin, system)
- [ ] Policy engine for rule-based evaluation (→ Milestone 8: Cedar/Rego, no proprietary DSL)
- [ ] Retention policies with auto-purge
- [ ] SSO / SAML integration
- [ ] Audit log for platform operations

### Connectors
- [x] Connector framework and base types (BaseAgentAdapter + TraceFieldMapping + AdapterRegistry)
- [ ] Slack connector (approval notifications)
- [ ] Jira connector (incident linking)
- [ ] SIEM export connector
- [ ] Webhook outbound connector

### Operations
- [ ] Health check endpoints on all services
- [ ] Prometheus metrics export
- [ ] Structured logging across all services
- [x] Docker Compose for full local stack
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Deployment documentation

---

## Icebox (Ideas, not committed)

- Real-time streaming replay (WebSocket)
- Run diffing / comparison tool
- Cost tracking and attribution per run
- Natural language investigation queries
- Automated anomaly detection on runs (→ moved to Ollama processor in Core-1)
- Connector marketplace
- Python SDK
- CLI tool for local development
