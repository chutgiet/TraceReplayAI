# TraceReplay AI — Sprint: Interception-1 (Three-Ring Capture + Decision Ledger)

## Goal
Implement ADR-0005: replace cooperative parallel-tool capture with transport-level interception, recorded as a tamper-evident decision ledger. Ship **record-only mode** — zero configuration, immediate audit value. Build order within the sprint follows the fidelity-per-effort ranking: **Ring 3 (filesystem ground truth) → ledger foundation → Ring 1 (native hooks) → Ring 2 groundwork**.

## Rationale
The current `tracereplay-mcp` parallel tools only capture what the agent chooses to route through them — a missing capture is indistinguishable from a quiet session. The hash chain is computed retroactively at bundle time, and `emitEvent()` drops events silently on failure. This sprint fixes all three structural gaps: independent observation (Ring 3), write-time integrity (ledger), and coverage of the agent's *real* tool calls (Ring 1). Ring 2 (the proxy spine) is deliberately last — it is the biggest build and should land on a proven ledger format.

## Dependencies
- **ADR-0005** — accepted; defines the decision record, three rings, attestation, and gap markers.
- **Milestones 1–4 (partial)** — event pipeline, evidence-service with retroactive integrity chain, MCP server all operational.
- **Claude Code hooks** — `PreToolUse`/`PostToolUse`/`PostToolUseFailure`/`SessionStart`/`Stop` in `.claude/settings.json`; exit 2 blocks with stderr surfaced to model; hooks can tighten but never loosen.
- **Codex hooks** — `.codex/hooks.json` (stable since v0.124.0); **bash events only**, deny-only, context via stdin JSON. Plan around this, don't assume parity.

## Sprint status of Core-1 (sprint-5)
Core-1 Tier 1 is complete (OTel Collector, OTLP endpoint, OTelSpanAdapter, VS Code profile, Ollama processor, evidence hash chain). Remaining Core-1 tiers are **paused**; still-relevant infra tasks (health checks, CI/CD, structured logging, OTel integration test) carry over here as Tier 4.

---

## Tasks — Tiered

### Tier 1 — Ledger foundation + Ring 3 (the record-only spine)

| ID | Task | Status | Est |
|----|------|--------|-----|
| I1-001 | Decision record event schema in `event-schema` | 🔲 | M |
| I1-002 | Write-time hash chaining (`chain_hash` on events, computed at persistence) | 🔲 | L |
| I1-003 | Ring 3: workspace snapshot capture (git tree hash at turn boundaries) | 🔲 | L |
| I1-004 | Configuration attestation + `capture.gap` markers | 🔲 | M |
| I1-005 | Durable local event spool (replace fire-and-forget emission) | 🔲 | M |

### Tier 2 — Ring 1: native hooks

| ID | Task | Status | Est |
|----|------|--------|-----|
| I1-006 | Claude Code hook pack (PreToolUse/PostToolUse/SessionStart/Stop) | 🔲 | L |
| I1-007 | Codex hook pack (bash-only) + limitations doc | 🔲 | M |
| I1-008 | Hook payload adapter in `connectors-core` | 🔲 | M |
| I1-009 | Deprecate parallel file/shell MCP tools | 🔲 | S |

### Tier 3 — Ring 2 groundwork (design only, no build)

| ID | Task | Status | Est |
|----|------|--------|-----|
| I1-010 | ADR-0006: MCP proxy architecture spike | 🔲 | M |
| I1-011 | Egress HTTPS proxy spike (model I/O capture feasibility) | 🔲 | M |

### Tier 4 — Carry-over infra from Core-1 (supports new services anyway)

| ID | Task | Status | Est |
|----|------|--------|-----|
| F4-007 | Health check endpoints on all services | 🔲 | S |
| F4-009 | Structured logging with correlation IDs | 🔲 | M |
| F4-008 | CI/CD pipeline (GitHub Actions) | 🔲 | M |
| C1-010 | Integration test: Copilot OTel → ingest → normalize → replay | 🔲 | M |

### Deferred (future sprints)

| ID | Task | Reason |
|----|------|--------|
| C1-005 | GenAI semantic convention full mapping | OTel path works at basic level; interception is priority |
| C1-007 | Ollama Docker integration | Enrichment is not on the critical path |
| C1-008 | MCP server OTel context propagation | Superseded by Ring 2 design |
| C1-009 | OTel metrics → run analytics | Post-interception |
| C1-012 | Ollama enrichment queue | Post-interception |
| — | Ring 2 build (proxy + egress) | Milestone 6 — needs proven ledger format from this sprint |
| — | Policy sidecar (Cedar/Rego), enforcement mode | Milestone 8 — record-only first by design |
| — | Deterministic replay harness | Milestone 7 — needs Ring 2 model I/O capture |

Est: S = small (< half day), M = medium (half–full day), L = large (1–2 days)

---

## Sequencing

```
TIER 1 — ledger + ground truth (order matters):
  I1-001 (Decision record schema) ──► I1-002 (Write-time chaining)
  I1-003 (Ring 3 snapshots)  ──┐  independent of I1-001/002
  I1-004 (Attestation + gaps)──┤  needs I1-001 event types
  I1-005 (Local spool)       ──┘  independent

TIER 2 — hooks (needs Tier 1 event types):
  I1-006 (Claude Code hooks) ──► I1-008 (Hook adapter)
  I1-007 (Codex hooks)       ──►
  I1-009 (Deprecate parallel tools) ← after I1-006 proves coverage

TIER 3 — design spikes, parallel with Tier 2:
  I1-010 (ADR-0006 proxy), I1-011 (egress spike)

TIER 4 — infra, parallel anytime:
  F4-007, F4-009, F4-008, C1-010
```

---

## Task details

### I1-001 — Decision record event schema

**Goal:** Add the decision record as a first-class canonical event type — the atomic unit enforcement will write and audit reads.

**Scope:**
- New event types in `packages/event-schema`: `decision.recorded`, `workspace.snapshot`, `session.attestation`, `capture.gap`
- `DecisionRecordedPayload`:
  - `agentIdentity` — passthrough of a consumed identity assertion (issuer, subject, raw claim); never issued by us
  - `proposedAction` — tool/command name + **full parameters** (post-redaction)
  - `policyVersionHash` — content hash of evaluating policy; literal `"record-only"` sentinel in record mode
  - `verdict` — `allow | deny | record_only`
  - `evidenceRefs` — event IDs consumed in the decision
  - `priorRecordHash` — hash of the previous decision record in this run
- Zod validators + payload map entries, following existing `PayloadMap` pattern in `types.ts`
- Fixtures for all new types

**Key files:** `packages/event-schema/src/types.ts`, `constants.ts`, `validators.ts`, `tests/fixtures/`

**Acceptance criteria:**
- [ ] All four event types validate via Zod and appear in `EVENT_TYPES`
- [ ] `TypedEvent` narrowing works for each new type
- [ ] Fixtures load and validate
- [ ] Existing 417+ tests still pass (additive change only)

---

### I1-002 — Write-time hash chaining

**Goal:** Move chain computation from evidence-bundle assembly to event persistence, so the chain is written by the component that recorded the event.

**Scope:**
- Migration: `chain_hash TEXT` column on events table
- On insert (normalizer persistence path): `chain_hash = SHA-256(id | timestamp | deterministicStringify(payload) | prev_chain_hash)` per run — reuse `deterministicStringify` from `evidence-service/src/integrity.ts` (move it to `packages/common`)
- Concurrency: chain per run serialized via per-run advisory lock or single-writer queue partition (events for one run already flow through one normalizer worker — document assumption)
- `evidence-service` verification switches to comparing stored `chain_hash` values; retroactive computation retained only for pre-migration bundles
- Back-chain existing rows once, in `ingestion_order`, during migration

**Key files:** `infrastructure/db/migrations/00X_chain_hash.sql`, `packages/common/src/`, `services/normalizer/src/`, `services/evidence-service/src/integrity.ts`

**Acceptance criteria:**
- [ ] Every new event persisted with a valid `chain_hash`
- [ ] Tampering with any stored event breaks verification at that link
- [ ] Evidence verify endpoint reports against the stored chain
- [ ] Out-of-order arrival handled: chain follows ingestion order, ADR-0004 read-time sorting unaffected

---

### I1-003 — Ring 3: workspace snapshot capture

**Goal:** Independent filesystem ground truth — never trust the tool log to say what landed on disk.

**Scope:**
- New package or module: `packages/workspace-snapshot` (used by hook pack and MCP server)
- Compute git tree hash of workspace **including untracked files** (temp index: `GIT_INDEX_FILE=$(mktemp) git add -A && git write-tree`; leaves the real index untouched)
- Emit `workspace.snapshot` events: `{ beforeTreeHash, afterTreeHash, diffHash, trigger: session_start | turn_boundary | session_end }`
- Diff hash: SHA-256 of `git diff <before-tree> <after-tree>` output
- Trigger points: `SessionStart`, `Stop`/`PostToolBatch` (Ring 1 integration), and session start/finalize in the MCP server
- Respect `.gitignore` but record its own hash too (an agent editing `.gitignore` to hide files must be visible)
- Real FS watcher (FSEvents/fanotify) explicitly out of scope — only needed for sub-turn granularity

**Key files:** `packages/workspace-snapshot/src/`, wiring in `services/tracereplay-mcp/src/index.ts`

**Acceptance criteria:**
- [ ] Snapshot captures tracked + untracked changes, real index untouched
- [ ] Writes via bash heredoc (invisible to Edit hooks) still surface in before/after diff
- [ ] Snapshot events chain into the ledger (I1-002)
- [ ] Works on macOS and Linux; sub-second on repos ≤ 100k files

---

### I1-004 — Configuration attestation + gap markers

**Goal:** Make missing capture visible. Clean-looking evidence of an unwatched period is worse than no evidence.

**Scope:**
- At session start: SHA-256 of `.claude/settings.json`, `.codex/hooks.json`, `~/.codex/config.toml`, `.vscode/mcp.json` (absent file → recorded as absent, not skipped)
- Emit `session.attestation` event, chained into ledger
- Emit `capture.gap` when: expected hook events missing between snapshots, spool flush fails permanently, or attestation hashes change mid-session
- Query service: `GET /v1/runs/:runId/gaps`

**Key files:** `packages/workspace-snapshot/src/attestation.ts`, `services/query-service/src/routes/`

**Acceptance criteria:**
- [ ] Attestation event at every session start with all config hashes
- [ ] Disabling a hook mid-session produces a visible `capture.gap`
- [ ] Gaps queryable per run

---

### I1-005 — Durable local event spool

**Goal:** Telemetry failure must produce late delivery + a gap marker, never silent loss.

**Scope:**
- Append-only local spool (NDJSON file per session under `~/.tracereplay/spool/`)
- Emitters write to spool first, then flush to ingest-api; flusher retries with backoff
- On permanent failure: events remain spooled, `capture.gap` emitted on next successful contact
- Replace `emitEvent()` fire-and-forget in `tracereplay-mcp`; reused by hook pack

**Key files:** `packages/sdk-typescript/src/spool.ts` (or `packages/common`), `services/tracereplay-mcp/src/index.ts`

**Acceptance criteria:**
- [ ] Ingest-api down → events spool locally, deliver on recovery, ordering preserved
- [ ] Crash mid-session → spool replayed on next start
- [ ] Gap marker emitted for any permanently undeliverable range

---

### I1-006 — Claude Code hook pack

**Goal:** Capture Claude Code's *real* tool calls — native `Read`/`Edit`/`Bash`/MCP — replacing the parallel-tool approach on this surface.

**Scope:**
- Hook scripts (Node, no external deps) for `SessionStart`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`
- `PreToolUse` → `decision.recorded` with `verdict: record_only` (never blocks in this sprint); `PostToolUse`/`PostToolUseFailure` → `tool.call.end` / `tool.call.error`; `Stop` → Ring 3 snapshot trigger
- Matcher config covering all tool groups; installable `.claude/settings.json` template + install script
- Events written via spool (I1-005)
- Payloads mapped through I1-008 adapter

**Key files:** `packages/hook-pack/src/claude-code/`, `docs/connectors/claude-code-hooks-setup.md`

**Acceptance criteria:**
- [ ] Real Claude Code session: every native tool call appears in replay timeline
- [ ] Tool inputs captured per-tool-shape (bash command, file path + edit, glob, etc.)
- [ ] Hook failure never blocks the agent (record-only exit 0 always)
- [ ] Session attestation records hook config hash

---

### I1-007 — Codex hook pack (bash-only)

**Goal:** Best-available Ring 1 coverage on Codex, with limitations recorded honestly.

**Scope:**
- `.codex/hooks.json` for bash `PreToolUse`/`PostToolUse` (stdin JSON, `cwd` as project dir)
- File writes explicitly NOT hookable → covered by Ring 3; stated in docs and encoded as expected-gap in attestation profile
- Config template + setup doc; note VS Code extension config-inheritance flakiness

**Key files:** `packages/hook-pack/src/codex/`, `docs/connectors/codex-hooks-setup.md`

**Acceptance criteria:**
- [ ] Codex bash calls captured to ledger
- [ ] Attestation profile for Codex marks file-write coverage as Ring 3-only (no false gap alarms)
- [ ] Limitations documented

---

### I1-008 — Hook payload adapter in connectors-core

**Goal:** Map hook JSON payloads to canonical events through the existing adapter registry.

**Scope:**
- `HookEventAdapter` extending `BaseAgentAdapter` (vendors: `claude-code-hooks`, `codex-hooks`)
- Map `tool_name`/`tool_input`/`tool_use_id` → canonical tool events + decision records; session ID → `runId`
- Register in `NormalizationService.createDefaultRegistry()`

**Key files:** `packages/connectors-core/src/hook-event-adapter.ts` + tests

**Acceptance criteria:**
- [ ] All hook payload shapes map to valid canonical events
- [ ] `tool_use_id` links start/end/error triples
- [ ] >90% test coverage with realistic hook JSON fixtures

---

### I1-009 — Deprecate parallel file/shell MCP tools

**Goal:** Stop pretending the parallel tools are the capture story.

**Scope:**
- Mark `tracereplay_list_files/read_file/search_code/apply_patch/run_command/git_status/git_diff` deprecated in tool descriptions; keep functional
- Keep: `record_approval`, `snapshot_context`, `attach_artifact`, `finalize_session`, `query_runs`, `query_timeline`
- Update `architecture-overview.md` tool table (done) + README

**Acceptance criteria:**
- [ ] Deprecated tools labeled in MCP tool descriptions
- [ ] Docs updated; removal scheduled post-I1-006

---

### I1-010 — ADR-0006: MCP proxy architecture spike

**Goal:** Design (not build) the Ring 2 spine so Milestone 6 starts from a decided architecture.

**Scope:** transparent forwarder design for stdio + Streamable HTTP; server-entry rewriting (`.vscode/mcp.json`, `[mcp_servers.*]` in config.toml); tool discovery passthrough; latency budget; trust model (OS/container-level config vs repo-editable files); relationship to existing `tracereplay-mcp`.

**Acceptance criteria:**
- [ ] ADR-0006 drafted with decision + alternatives
- [ ] Prototype forwards one real MCP server end-to-end (throwaway code acceptable)

---

### I1-011 — Egress HTTPS proxy spike

**Goal:** Prove model I/O capture feasibility — the prerequisite for deterministic replay.

**Scope:** local CA + HTTPS MITM proxy; `HTTP_PROXY`/`HTTPS_PROXY` honored by Node-based CLIs; Codex `[features.network_proxy]` with domain allowlist; measure capture completeness for one Claude Code and one Codex session; document cert-pinning obstacles.

**Acceptance criteria:**
- [ ] Raw model request/response captured for at least one real session per CLI
- [ ] Findings + blockers documented for Milestone 7 planning

---

## The honest problem (carried from ADR-0005)

Hooks are cooperative — they live in files the agent can edit. This sprint's mitigations, in order of strength:
1. **Ring 3 is non-cooperative** — snapshots don't care which tool wrote the file
2. **Attestation makes tampering visible** — config hash changes mid-session are gap-marked
3. **Spool makes loss visible** — undeliverable ranges are gap-marked, not dropped
4. **Ring 2 (next milestone) moves the spine out of repo-editable files entirely**

## Sprint exit criteria

- [ ] Decision record, snapshot, attestation, and gap event types in canonical schema
- [ ] Every persisted event carries a write-time `chain_hash`; evidence verify reads the stored chain
- [ ] A real Claude Code session is captured via native hooks with zero parallel-tool usage: all tool calls, before/after tree hashes, attestation, and no unexplained gaps
- [ ] A Codex session captures bash + Ring 3 diffs with file-write coverage honestly marked Ring 3-only
- [ ] Killing ingest-api mid-session loses zero events (spool) and the outage is gap-marked
- [ ] ADR-0006 drafted; egress spike findings documented
- [ ] Carry-over infra done: health checks, structured logging, CI/CD, OTel integration test
- [ ] All new code >80% unit test coverage
