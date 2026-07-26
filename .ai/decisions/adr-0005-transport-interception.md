# ADR-0005: Transport-Level Interception and the Decision Ledger

## Status
**Accepted** — July 2026

## Context

TraceReplay's current capture path is the `tracereplay-mcp` server: a parallel MCP tool provider (`tracereplay_read_file`, `tracereplay_apply_patch`, `tracereplay_run_command`, …) that instruments its own tools. This has a structural flaw: **it only captures what the agent chooses to route through TraceReplay's tools**. If Claude Code uses its native `Read`/`Edit`/`Bash`, or Codex calls another MCP server, nothing is recorded — and nothing records that nothing was recorded. A missing capture is indistinguishable from a quiet session.

Related weaknesses in the current design:

- **Retroactive integrity**: the evidence hash chain (`evidence-service/src/integrity.ts`) is computed at bundle-assembly time over whatever events already landed, not written atomically at capture time.
- **Best-effort emission with silent loss**: `emitEvent()` drops events on ingest failure with only a stderr line. An audit system that silently records nothing when disabled is worse than no audit system.
- **Decorator-style coverage**: instrumenting individual tools covers only what someone remembered to instrument — exactly the failure mode an audit layer must eliminate.

Meanwhile the market context has shifted: policy gates are commoditizing (APort, Microsoft ACS/ASSERT, OPA adapters), agent identity is a crowded fight (APort passports, Entra Agent ID, NIST NCCoE), and nobody has shipped deterministic replay for agents well.

## Decision

### 1. One primitive: the decision record

The atomic unit of the system is a **decision record**, not a trace or a span. It carries:

- agent identity (a consumed assertion, never issued by us)
- the proposed action with full parameters
- the content hash of the policy version that evaluated it (in record-only mode: the literal `record-only` policy hash)
- the verdict
- references to the evidence consumed
- the hash of the prior record (chained **at write time**, per run — not retroactively at bundle time)

Enforcement writes it; audit reads it. One schema, not two subsystems reconciled later. This extends — does not replace — the canonical event model: decision records are events in the same stream, and the existing evidence-bundle chain becomes a verification of the write-time chain rather than the source of truth.

### 2. Intercept at the transport, in three rings

No single mechanism covers every surface, so capture is layered in decreasing fidelity:

| Ring | Mechanism | Covers | Trust level |
|---|---|---|---|
| **Ring 1** | Native agent hooks (`PreToolUse`/`PostToolUse` in `.claude/settings.json`; `.codex/hooks.json` bash-only) | Tool calls, file writes (Claude Code); bash only (Codex) | Cooperative — agent-editable config |
| **Ring 2** | MCP proxy + egress HTTPS proxy | All MCP tool calls incl. runtime-discovered tools; raw model I/O | Harder to remove — OS/container level |
| **Ring 3** | Filesystem ground truth: git tree hash snapshots (incl. untracked) at session start and turn boundaries | What actually landed on disk, regardless of which tool wrote it | Independent observer |

Build order: **Ring 3 → Ring 1 → Ring 2**. Ring 3 is cheapest, universal across all surfaces, and purely additive. Ring 1 gives the highest fidelity per effort on Claude Code today. Ring 2 is the biggest build and the only ring that closes the Codex/managed-chat gaps and captures model I/O — do it once the ledger format is proven.

### 3. Configuration attestation and gap markers

Hooks are cooperative — they live in files the agent can edit. Therefore the ledger must record their presence: hash `settings.json`, `hooks.json`, and `config.toml` at session start, chain the attestation into the ledger, and emit an explicit **gap marker** whenever the expected capture chain is incomplete (missing hook, failed emission, unreachable ingest). Emission moves from fire-and-forget to a durable local spool so transient failures produce late delivery, not silent loss.

### 4. Record-only is the default; enforcement is a switch

Ship record-only mode with zero configuration: no policy authored, immediate value (a verifiable log of everything agents did — a compliance artifact people already need). Enforcement is flipped on later, on rules the product proposes from observed traffic. Get in the door as a recorder; become the control plane once already on the wire.

### 5. Do not invent a policy language; do not build identity

When enforcement ships, policies compile to **Cedar or Rego** — a fifth DSL is a tax on adopters and a reason for security teams to say no. The engine is a local sidecar, sub-millisecond, fail-closed, no model in the hot path. Identity is **consumed as an assertion** (APort passport, Entra Agent ID, whatever wins), never issued — every layer we own is a layer we must defend.

### 6. Replay means re-execution, and it is the moat

The existing `replay-engine` builds a *viewing* timeline. The strategic capability is **deterministic re-execution**: capturing every nondeterministic input a run consumed — model responses, retrieval results, tool outputs, clock reads, seeds — so the run can be re-executed faithfully. Ring 2's model I/O capture is the prerequisite. This serves a different buyer (litigator, regulator) than the security engineer buying a gate.

### 7. The existing MCP server is reframed, not deleted

- **Keep**: `tracereplay_record_approval`, `tracereplay_snapshot_context`, `tracereplay_attach_artifact`, `tracereplay_query_runs`, `tracereplay_query_timeline` — these are agent-facing APIs, not interception, and hooks cannot replace them.
- **Deprecate**: the parallel file/shell tools (`tracereplay_read_file`, `tracereplay_list_files`, `tracereplay_search_code`, `tracereplay_apply_patch`, `tracereplay_run_command`, `tracereplay_git_status`, `tracereplay_git_diff`) — superseded by Rings 1–3.

## Alternatives considered

### 1. Keep expanding the parallel-tool MCP server
Rejected: coverage depends on agent cooperation, which is the failure mode being eliminated. No amount of additional tools fixes "the agent used its native tools instead."

### 2. Hooks only (skip the proxy)
Rejected as an end state, accepted as a phase. Codex hooks only fire for bash (no file-write or MCP hooks); managed chat surfaces have no hooks at all; and no hook surface exposes raw model request/response, which replay requires.

### 3. Proxy only (skip hooks)
Rejected: hooks are the only pre-execution *blocking* point on Claude Code (`PreToolUse` exit 2 blocks with stderr surfaced to the model) and the cheapest source of structured tool-call payloads. The proxy is the spine; hooks are enrichment.

### 4. Build our own policy DSL / identity layer
Rejected per decisions 5 — crowded fights, adoption tax, defense surface.

## Consequences

- **Coverage by construction**: once Ring 2 exists, tools discovered at runtime are covered without per-tool work.
- **Honest gaps**: attestation + gap markers mean an incomplete record says so — auditors can distinguish "nothing happened" from "nothing was watching."
- **Schema stability matters more**: the decision record and ledger format become the public contract (Apache 2.0: interceptor, ledger format, replay engine; commercial: multi-tenant retention, external anchoring, evidence packs).
- **Migration debt**: write-time chaining requires an events-table migration and a change to how evidence-service verifies (verify stored chain, not recompute-from-scratch).
- **Codex remains second-class until Ring 2**: bash-only hooks mean Codex file writes are visible only via Ring 3 snapshots until the proxy ships.

## Migration

- New event types (`decision.recorded`, `workspace.snapshot`, `session.attestation`, `capture.gap`) are additive to the canonical schema.
- Events table gains a `chain_hash` column; existing rows are back-chained once in migration order, after which all inserts chain at write time.
- `evidence-service` verification switches from recomputing chains to verifying stored `chain_hash` values; bundle-level root hash retained for export compatibility.
- Parallel file/shell MCP tools remain functional but documented as legacy; removed after Ring 1 ships for Claude Code.
