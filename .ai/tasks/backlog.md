# TraceReplay AI — Backlog

## Priority: High

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
- [ ] Evidence bundle assembly from run data
- [ ] JSON export format
- [ ] PDF summary generation
- [ ] Evidence integrity hash chain
- [x] Redaction engine with configurable rules

---

## Priority: Low (Future)

### Enterprise
- [ ] Multi-tenant data isolation
- [ ] RBAC system (viewer, investigator, admin, system)
- [ ] Policy engine for rule-based evaluation
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
- Automated anomaly detection on runs
- Connector marketplace
- Python SDK
- CLI tool for local development
