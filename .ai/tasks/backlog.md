# TraceReplay AI — Backlog

## Priority: High

### Ingestion & Schema
- [x] Canonical event schema package with full type definitions
- [x] Zod runtime validators for all event types
- [x] Ingest API with schema validation and persistence
- [x] Idempotent ingestion (dedup by event ID)
- [ ] Out-of-order event handling strategy
- [x] Batch ingestion endpoint

### Replay & Lineage
- [ ] Basic replay engine: ordered timeline from events
- [ ] Causal replay: parent-child event linking
- [ ] Gap detection: identify missing spans in a run
- [ ] Lineage graph model: run → events → side effects
- [ ] Sub-agent run linking

### SDK
- [ ] TypeScript SDK: lightweight event client
- [ ] Auto-instrumentation helpers for common patterns
- [ ] OpenAI Agents SDK adapter
- [ ] LangGraph/LangChain adapter

---

## Priority: Medium

### Investigation & Query
- [ ] Query service: list runs, filter by status/agent/time
- [ ] Full-text search across event payloads
- [ ] Run timeline API for frontend consumption
- [ ] Event detail API with redaction awareness

### Frontend
- [ ] Next.js app scaffold
- [ ] Run list page with filters
- [ ] Run detail / replay timeline view
- [ ] Event detail expandable panel
- [ ] Basic lineage graph visualization
- [ ] Shared UI component library

### Evidence & Compliance
- [ ] Evidence bundle assembly from run data
- [ ] JSON export format
- [ ] PDF summary generation
- [ ] Evidence integrity hash chain
- [ ] Redaction engine with configurable rules

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
- [ ] Connector framework and base types
- [ ] Slack connector (approval notifications)
- [ ] Jira connector (incident linking)
- [ ] SIEM export connector
- [ ] Webhook outbound connector

### Operations
- [ ] Health check endpoints on all services
- [ ] Prometheus metrics export
- [ ] Structured logging across all services
- [ ] Docker Compose for full local stack
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
