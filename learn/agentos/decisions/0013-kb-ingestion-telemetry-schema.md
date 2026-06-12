# ADR 0013: KB Ingestion Telemetry Schema — Event-Shaped `kb_ingestion_metrics` Table

> Architectural Decision Record codifying the per-tenant ingestion-telemetry persistence contract introduced by Phase 4A (#11639) of the Cloud-Native KB Ingestion epic (#11624). Authority artifact for the `kb_ingestion_metrics` table shape that the Phase 2 ingestion service (#11626) writes against and the Phase 4A-β observability daemon + Phase 4D alerting consume. Implementation companion is the PR for #11639's schema slice (`Related: #11639` — the ticket stays open for the Phase 4A-β daemon slice, per §3.4); this ADR is the graph-queryable WHY for the event-shaped (vs pre-aggregated) schema choice.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-05-20 (awaiting #11639 PR merge to establish empirical substrate before transition to Accepted, per ADR 0005 lifecycle) |
| **Author** | @neo-opus-4-7 (Claude Opus 4.7) drafting; substrate-truth grounded in #11628 Phase 4 epic decomposition + #11639 implementer-hot-context shaping |
| **Implementation ticket** | #11639 — *"Phase 4A — Per-Tenant Ingestion Observability Daemon (KBRecorderService Extension)"* (this ADR + PR cover the schema slice; daemon shell deferred to Phase 4A-β). The earlier-filed #11665 was a duplicate of #11639 — closed `not_planned` 2026-05-20; #11639 is the canonical Phase 4A sub-ticket per the #11628 → #11639/#11640/#11641/#11642 (4A/4B/4C/4D) decomposition. |
| **Companion implementation PR** | PR for #11639's schema slice — references `Related: #11639` (not `Resolves:`); the ticket stays open for the Phase 4A-β daemon slice per §3.4. This ADR's §2 contract becomes live substrate only after that PR merges. |
| **Anti-anchor for** | Pre-aggregated-counter schemas (rejected in §3); separate-telemetry-database (rejected in §3); daemon-rolls-up-empty-table dead-code-before-Phase-2 (the scope-correction that split #11639 into schema-now / daemon-later) |

---

## 1. Context

Phase 4 (#11628) decomposes operational observability for cloud-native KB deployments into 4 sub-phases (4A observability, 4B reconciliation, 4C garbage collection, 4D alerting). Phase 4A needs a durable per-tenant ingestion-telemetry substrate so that:

- Phase 4A-β observability daemon can roll up + persist per-tenant ingestion metrics.
- Phase 4D alerting can threshold-check per-tenant error rates + push frequency.
- Operators can reason about ingestion-fleet health (push frequency, error rates, chunk volumes, embedding-budget burn).

The existing `KBRecorderService` (`ai/services/knowledge-base/KBRecorderService.mjs`) already persists KB MCP tool telemetry into the shared Memory Core SQLite database via `kb_query_log` + `kb_query_faqs`. Phase 4A extends that substrate rather than introducing a new one.

**Pre-Phase-2 scope boundary.** A telemetry-ROLLUP daemon has nothing to roll up until the Phase 2 cross-tenant ingestion service (#11626) exists and calls `recordIngestionMetric`. The daemon shell would be dead code before Phase 2. The genuinely pre-Phase-2-actionable slice — and the scope of #11639's PR — is the **persistence schema + write-API + read-API**: the contract Phase 2 writes against. The daemon shell moves to Phase 4A-β (post-Phase-2).

## 2. Decision

### 2.1 `kb_ingestion_metrics` table — event-shaped

A new SQLite table in the shared Memory Core database, created by `KBRecorderService.initAsync` beside `kb_query_log` / `kb_query_faqs`:

```sql
CREATE TABLE IF NOT EXISTS kb_ingestion_metrics (
    id              TEXT PRIMARY KEY,   -- crypto.randomUUID()
    timestamp       INTEGER NOT NULL,   -- event wall-clock (ms epoch)
    tenant_id       TEXT NOT NULL,      -- authoritative tenant id (server-stamped per #11631)
    repo_slug       TEXT NOT NULL,      -- authoritative repo slug
    origin_agent    TEXT,               -- authenticated agent identity that triggered the event
    event_type      TEXT NOT NULL,      -- 'ingest' | 'tombstone' | 'reconcile' | 'error'
    chunks_total    INTEGER DEFAULT 0,  -- chunks seen in the event payload
    chunks_embedded INTEGER DEFAULT 0,  -- chunks newly embedded
    chunks_deleted  INTEGER DEFAULT 0,  -- chunks deleted (tombstone / stale-id sweep)
    duration_ms     INTEGER,            -- event wall-clock duration
    error_code      TEXT,               -- stable error code when event_type = 'error'
    detail          TEXT                -- free-form per-event detail (JSON-serialized)
);
```

Indexed on `tenant_id`, `timestamp`, `event_type` — the three dimensions every rollup / alerting query filters or groups on.

### 2.2 Write-API — `KBRecorderService.recordIngestionMetric(entry)`

One row per ingestion event. Best-effort observability side channel — never throws back into the ingestion path (mirrors the existing `log()` contract). The Phase 2 ingestion service calls this after each push / tombstone / reconcile / error event.

### 2.3 Read-API — `KBRecorderService.getTenantIngestionRollup({sinceMs, tenantId})`

Aggregates `kb_ingestion_metrics` rows into per-tenant counters: event counts per type, total chunk volumes, error rate. Consumed by the Phase 4A-β daemon + Phase 4D alerting. The rollup is computed on-read (SQL `GROUP BY`) — the table stores raw events, not pre-aggregated state.

## 3. Decision Process — Rejected Alternatives

### 3.1 Pre-aggregated per-tenant counter table (rejected)

**Shape:** one row per tenant, columns incremented in place (`ingest_count`, `error_count`, etc.).

**Rejected because:**
- Loses time-windowing — Phase 4D alerting needs "error rate over the last N minutes", which a running counter cannot answer.
- Write-contention — concurrent ingestion events for the same tenant would `UPDATE` the same row, serializing the write path. Event-shaped `INSERT`-only writes are contention-free.
- Loses per-event detail (`duration_ms`, `error_code`, `detail`) needed for Phase 4B reconciliation forensics.

The event-shaped table keeps the write path O(1) + contention-free; rollup is the daemon's read-time job.

### 3.2 Separate telemetry database (rejected)

`KBRecorderService` already uses the shared Memory Core SQLite database. A separate database would fork the operability story + add a second connection lifecycle to manage. Rejected per #11628 Avoided-Traps ("New telemetry database — KBRecorderService already uses Memory Core SQLite; reuse the substrate").

### 3.3 Extend `kb_query_log` with tenant columns (rejected)

`kb_query_log` is query-call-shaped (one row per MCP tool invocation). Ingestion metrics are ingestion-event-shaped (one row per push / tombstone / reconcile). Overloading one table with two distinct event grammars would force every consumer to filter on a discriminator column + complicate the existing FAQ-projection path. A sibling table is the cleaner separation.

### 3.4 Daemon shell shipped pre-Phase-2 (rejected — scope correction)

#11639 originally scoped the observability DAEMON into the same PR as the schema. Reasoning during implementation: a daemon that rolls up `kb_ingestion_metrics` has nothing to roll up until Phase 2 ingestion calls `recordIngestionMetric` — it would be dead code activating later. The schema + write/read APIs have standalone pre-Phase-2 value (they're the contract Phase 2 writes against). #11639's PR ships the schema slice; the daemon shell moves to Phase 4A-β as an explicit post-Phase-2 follow-up. This is a friction-to-gold scope-correction: catching dead-code-before-dependency by reasoning about what's genuinely actionable now.

## 4. Consequences

- **Phase 2 (#11626)** ingestion service gains a stable telemetry contract — call `recordIngestionMetric` after each event; no schema negotiation needed.
- **Phase 4A-β** observability daemon consumes `getTenantIngestionRollup` — periodic rollup + persist to an operator-facing surface (portal app health section OR `sandman_handoff.md`).
- **Phase 4D** alerting thresholds per-tenant `errorRate` / event frequency from the same read-API.
- **Per-tenant telemetry retention** — distinct from the Phase 4 bundle retention (#11663). The `kb_ingestion_metrics` table will need its own retention sweep (delete rows older than N days) once volume justifies it; deferred to a Phase 4 follow-up — flagged here so future agents see the open thread.

## 5. Related

- **Parent Phase Epic:** #11628 (Phase 4: Operations + Observability)
- **Parent meta-Epic:** #11624 (Cloud-Native KB Ingestion)
- **Implementation ticket:** #11639 (schema slice) + Phase 4A-β follow-up (daemon shell, post-Phase-2)
- **Write-side identity source:** #11631 (Phase 0/1C-α) — the `tenantId` / `repoSlug` / `originAgentIdentity` values stamped here are the authoritative server-derived values this telemetry records.
- **Substrate-extension target:** `ai/services/knowledge-base/KBRecorderService.mjs`
- **Sibling ADR:** ADR 0003 (Chroma Topology Unified Only) — the unified-Chroma topology this telemetry observes.
