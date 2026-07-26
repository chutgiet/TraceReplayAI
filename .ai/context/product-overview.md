# TraceReplay AI — Product Overview

## What is TraceReplay AI?

TraceReplay AI is an audit-grade replay and lineage platform for enterprise AI agents. It captures the full execution lifecycle of AI agent runs — prompts, retrieved context, tool calls, approvals, outputs, errors, and downstream side effects — at the **transport level** (agent hooks, MCP/egress proxy, filesystem snapshots), records them as a tamper-evident decision ledger, and reconstructs them into replayable execution graphs.

## Strategy: recorder first, control plane later (ADR-0005)

Enforcement products die in the gap where a customer must author policy before receiving any value. TraceReplay inverts the sequence:

1. **Record-only mode is the default** — zero configuration, no policy written. Installing it immediately yields a verifiable log of everything your agents did: a compliance artifact teams already need.
2. **Enforcement is a switch flipped later** — on rules the product proposes from observed traffic, compiled to Cedar/Rego (never a proprietary DSL).
3. **Deterministic replay is the moat** — policy gates are commoditizing (APort, Microsoft ACS/ASSERT, OPA adapters); faithful re-execution of agent runs is genuinely hard, unshipped by anyone, and what a litigator or regulator actually needs. That is a different buyer than the security engineer buying a gate.

**Open-core split**: Apache 2.0 on the interceptor, ledger format, and replay engine — so the format can become a standard. Commercial layer: multi-tenant retention, external anchoring, evidence packs.

## Target users

| Persona | Need |
|---|---|
| **AI/ML Engineers** | Debug agent behavior, understand failures, improve reliability |
| **Platform Engineers** | Monitor agent fleet health, enforce standards, manage integrations |
| **Security/Compliance Teams** | Audit agent actions, investigate incidents, produce evidence |
| **Product Managers** | Understand what agents actually do, validate behavior against intent |
| **Risk/Legal** | Demonstrate AI governance, regulatory compliance, accountability |

## Core use cases

1. **Execution replay** — Step through exactly what an AI agent did, in causal order
2. **Root cause investigation** — Find where and why an agent failed or produced unexpected output
3. **Compliance audit** — Generate evidence bundles for security reviews and regulatory inquiries
4. **Drift detection** — Compare current behavior against previous runs or baselines
5. **Lineage tracing** — Map the chain of data, decisions, and side effects across systems
6. **Operational monitoring** — Track agent health, error rates, latency, and cost
7. **Live development capture** — Capture AI coding agent sessions (Copilot, Codex, Claude Code) via transport-level interception: native hooks, MCP/egress proxy, and filesystem ground-truth snapshots
8. **Verifiable ground truth** — Prove what actually changed on disk (git tree hashes at turn boundaries), independent of what the tool log claims
9. **Honest audit gaps** — Config attestation and explicit gap markers so an incomplete record says so, rather than looking clean

## Non-goals

- We are NOT building a generic logging/observability platform (use Datadog, Grafana for that)
- We are NOT building an agent framework (use LangChain, CrewAI, AutoGen for that)
- We are NOT building a prompt management tool (use PromptLayer, Humanloop for that)
- We are NOT replacing APM (use New Relic, Dynatrace for that)
- We are NOT inventing a policy language — enforcement compiles to Cedar or Rego (ADR-0005)
- We are NOT building agent identity — we consume identity assertions (APort passport, Entra Agent ID), never issue them (ADR-0005)

We are building the **forensic investigation and audit layer** for AI agent operations — the recorder that becomes the control plane.

## Current MVP scope

### In scope (v0.1)
- Canonical event schema for agent runs
- TypeScript SDK for event ingestion
- REST API for event ingestion
- Event normalization pipeline
- Basic replay engine (timeline reconstruction)
- Simple lineage graph (run → events → side effects)
- Web UI: run list, replay viewer, event detail
- Field-level redaction support
- Fixture-based test suite

### Out of scope (future)
- Multi-tenant access control
- Policy engine / rule evaluation
- Evidence bundle export (PDF, JSON, SIEM)
- Framework-specific adapters (LangChain, OpenAI Agents, etc.)
- Real-time streaming replay
- Connector marketplace
- Run diffing / comparison
- Cost tracking and attribution

## Success metrics

- An engineer can replay any agent run within 30 seconds of it completing
- A compliance analyst can generate an evidence bundle for any run
- The system handles partial/messy telemetry gracefully — no crashes, no fabricated data
- Event ingestion is idempotent and handles duplicates/out-of-order delivery
