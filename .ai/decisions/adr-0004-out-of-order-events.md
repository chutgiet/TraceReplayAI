# ADR-0004: Out-of-Order Event Handling Strategy

## Status
**Accepted** — March 2026

## Context

AI agent telemetry events may arrive at the ingest API out of chronological order. This can happen due to:

- **Network conditions**: events buffered in SDKs may be flushed in different order than produced
- **Concurrent emission**: multiple tool calls running in parallel produce events with overlapping timestamps
- **Retry/redelivery**: failed event deliveries retried later arrive after newer events
- **Distributed agents**: sub-agents in different processes or hosts emit events at different rates

The ingest API currently persists events as they arrive. The replay engine must produce a correct, deterministic timeline regardless of ingestion order.

## Decision

**Accept events in any order and reconstruct correct timelines at read time.** Specifically:

### Write path (ingest-api)
- **No reordering on write**: events are persisted as they arrive
- **Ingestion order tracking**: a `BIGSERIAL` column `ingestion_order` on the events table records the monotonically increasing arrival order
- The existing `timestamp` (source time) and `sequence` (source-assigned) columns are preserved unchanged

### Read path (query & replay)
- **Sort by source order**: `getEventsByRunId()` orders by `timestamp ASC, sequence ASC NULLS LAST, ingestion_order ASC`
- **Replay engine sorts independently**: `buildTimeline()` sorts by `timestamp` (primary) then `sequence` (secondary), producing a deterministic timeline regardless of arrival order
- `ingestion_order` serves as a final tiebreaker in the DB query when timestamp and sequence are identical

### Diagnostics
- `ingestion_order` enables debugging delivery issues: comparing `ingestion_order` vs. `sequence` reveals how out-of-order a batch was
- The `received_at` timestamp already tracks when each event was received

## Alternatives considered

### 1. Buffer and reorder on write
Hold events in a buffer, then sort and write in batches. Rejected because:
- Adds latency to ingestion
- Requires deciding buffer duration (how long to wait for "late" events)
- Complicates the write path for a problem that's solved simply at read time

### 2. Require events in order
Reject events that arrive out of sequence. Rejected because:
- Would drop valid telemetry
- Violates the principle of "missing data stays missing — never fabricate or discard telemetry"
- Puts ordering burden on SDK clients, reducing reliability

### 3. Sequence-based reordering at ingest
Accept all events, then sort in the DB by `sequence` only. Rejected because:
- `sequence` is optional and may have gaps
- Some vendor formats don't provide sequence numbers
- `timestamp` is the more universal ordering signal

## Consequences

- **Replay correctness**: timelines are deterministic regardless of ingestion order, because the replay engine sorts by source timestamp + sequence
- **Low write-path complexity**: ingestion remains a simple INSERT with no buffering or reordering
- **Diagnostics capability**: `ingestion_order` enables monitoring event delivery health
- **DB overhead**: one additional `BIGSERIAL` column and index, minimal storage impact
- **SDK flexibility**: SDKs can batch and retry freely without worrying about delivery order

## Migration

- Migration `002_add_ingestion_order.sql` adds the `ingestion_order BIGSERIAL` column to the events table
- Existing events (if any) receive auto-assigned `ingestion_order` values based on their existing row order
- No backfill needed — the column is additive and does not affect existing data
