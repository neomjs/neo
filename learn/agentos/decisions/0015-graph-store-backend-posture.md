# ADR 0015: Graph Store Backend Posture - SQLite WAL First, Networked SQL Deferred

> Architectural Decision Record for #11732, the post-MVP D5 graph-store evolution
> workstream under Epic #11730. Records the gate challenge outcome: keep the
> Memory Core graph on SQLite + WAL for the current cloud deployment shape, and
> defer networked SQL until graph-specific multi-writer or scale evidence appears.

| Attribute | Value |
|---|---|
| **Status** | Accepted - 2026-05-22 (merged via PR #11779; resolves #11732 per ADR 0005 lifecycle) |
| **Author** | @neo-gpt (GPT-5 Codex), grounded in live #11732 intake, `Neo.ai.graph.storage.SQLite`, ADR 0005, ADR 0009, ADR 0014, and current cloud-deployment docs |
| **ADR classification** | ADR_REQUIRED per ADR 0005 §2.1: the #11718 graduation decomposed durable cloud-deployment residuals into future tickets, and the graph-store backend posture would otherwise require archaeology across Discussion #11718, #11730, #11732, ADR 0009, ADR 0014, and episodic memory |
| **Resolves** | #11732 - *"Graph-store evolution - SQLite to networked SQL (post-MVP, D5)"* |
| **Parent** | #11730 - *"Cloud Agent OS Deployment - Post-MVP Residual Workstreams"* |
| **Origin Discussion** | #11718 - D5 residual: graph-store evolution beyond the MVP SQLite + mounted-volume baseline |
| **Informs** | #11730 closeout/disposition; future graph-store and deployment-topology tickets; ADR 0014 cloud deployment topology |
| **Anti-anchor for** | Promoting a SQL server because Chroma or heavy-maintenance lanes were contended; treating "networked SQL" as the next step without graph-specific evidence |

---

## 1. Context

#11732 captured D5 from Discussion #11718: if the Agent OS cloud deployment
outgrows the MVP graph-store baseline, evaluate moving the Memory Core graph from
SQLite on a mounted volume to a networked SQL backend.

ADR 0005 governs why this belongs in `learn/agentos/decisions/` instead of only
as a ticket comment. The decision durably governs a cross-substrate backend
choice, originated from a graduated Discussion, and affects future graph-store,
deployment, backup/restore, and concurrency work. Under ADR 0005 §2.1, that is
`ADR_REQUIRED`: future V-B-A would otherwise require reconstruction across
Discussion #11718, Epic #11730, this issue, ADR 0009, ADR 0014, and memory
handoffs.

That gate must be challenged, not treated as a lock. The post-#11720 substrate
now has enough evidence to decide the current posture:

- `Neo.ai.graph.storage.SQLite` uses `better-sqlite3`, enables
  `journal_mode = WAL`, sets `busy_timeout = 5000`, and keeps foreign keys on.
- The graph substrate is a relational edge graph (`Nodes`, `Edges`, `GraphLog`,
  `SummarizationJobs`) with cache-coherence semantics already built around
  SQLite WAL and `GraphLog`.
- The cloud deployment profile persists the SQLite graph via a mounted volume.
- The recurring "shared substrate is busy" pain is primarily Chroma /
  embedding / heavy-maintenance contention, not proven graph SQL contention.
- ADR 0009 and the heavy-maintenance lease serialize the heavy Chroma / SQLite /
  LLM maintenance lanes across processes; ADR 0014 keeps the cloud profile to the
  cloud-safe scheduler lanes.

Networked SQL remains a valid future direction, but it is not a free
non-blocking-access upgrade. It adds an always-on service, connection pooling,
backup/restore changes, migration tooling, tenant/RLS review, and new failure
modes. It also does not solve Chroma daemon saturation, which is the access
trouble most often observed in the current Agent OS.

## 2. Graph Pressure Taxonomy

The backend decision must classify graph pressure by the actual write surface,
not by generic "Agent OS is busy" symptoms.

| Pressure class | Current write surface | Evidence | Backend posture |
|---|---|---|---|
| Light / fixed-cardinality graph writes | A2A mailbox routing writes one `MESSAGE` node plus `SENT_BY` / `SENT_TO` edges, optional broadcast `DELIVERED_TO` edges, and optional session / ticket / concept links. | `MailboxService.addMessage()` calls `GraphService.upsertNode()` once for the message, then `GraphService.linkNodes()` for routing and optional semantic edges. Empty unread-message probes are measured at ~5ms against local SQLite `MESSAGE` + `SENT_TO` state. | Not a networked-SQL trigger. If A2A routing ever becomes noisy, tune mailbox indexing, batching, or wake fan-out before changing the graph backend. |
| A2A sidecar LLM pressure | Message concept auto-extraction is fire-and-forget after delivery and may call the OpenAI-compatible provider before adding auto-extracted `TAGGED_CONCEPT` edges. | `MailboxService.addMessage()` returns after scheduling `SemanticGraphExtractor.extractMessageConcepts()`, and the extractor can perform up to two provider generations for a message body. | Also not a graph-backend trigger. If this becomes expensive, gate, batch, throttle, or disable the extractor; do not attribute provider pressure to SQLite. |
| Medium / accumulated projection writes | Session and memory graph projection upserts `SESSION` / `MEMORY` nodes and `ORIGINATES_IN` edges per memory row; lazy-edge draining can back-fill endpoints and then link queued provenance edges. | `MemorySessionIngestor.syncSessionToGraph()` iterates the Chroma memory rows for a session; `LazyEdgeDrainer` drains JSONL queue entries through `GraphService.linkNodesAsync()`. | Keep SQLite unless measured lock contention appears after WAL, `busy_timeout`, and lease discipline. |
| Heavy / bulk graph mutation | DreamMode / Sandman REM cycles ingest concepts, walk the repository into file/directory nodes, project sessions, run Tri-Vector extraction, attach gap metadata, and run garbage collection / decay. | `DreamService.processUndigestedSessions()` runs `ConceptIngestor.syncConceptsToGraph()`, `FileSystemIngestor.syncWorkspaceToGraph()`, `MemorySessionIngestor.syncSessionToGraph()`, semantic extraction, gap inference, and graph cleanup; `runSandman.mjs` wraps this in the heavy-maintenance lease and then runs global topology decay inside that lease. | This is the primary graph-pressure lane to monitor. First response is lease / cadence / backup discipline; networked SQL is only justified by measured graph-specific contention or deployment semantics beyond single-node SQLite. |

This taxonomy keeps the cheap coordination path separate from the actual heavy
graph writers. A2A messages should remain available for swarm coordination;
DreamMode, Sandman, filesystem graph sync, bulk backfill, and topology decay are
the lanes that need pressure instrumentation and scheduling discipline.

## 3. Decision

Keep the Memory Core graph on SQLite + WAL + `better-sqlite3` for the current
cloud deployment baseline.

SQLite + mounted volume is the default until graph-specific evidence falsifies
it. Networked SQL is deferred to a fresh decision cycle only if one of the
triggers in section 4 fires.

This decision does not weaken the D5 capture in #11730. It resolves #11732 by
recording that the current falsifying evidence supports "SQLite remains
sufficient" rather than "implement a SQL server now."

## 4. Reopen Triggers

Reopen the networked-SQL question only when at least one graph-specific trigger
is observed:

1. **Multi-writer graph topology:** a deployment needs multiple live Memory Core
   writers or orchestrator instances mutating the same graph concurrently beyond
   the single-MC-service + scheduled-maintenance model.
2. **Measured SQLite graph contention:** logs, tests, or production telemetry show
   DreamMode / Sandman, filesystem graph sync, lazy-edge draining, session
   projection, or other graph operations failing or stalling on SQLite locks
   after WAL, `busy_timeout`, and heavy-maintenance lease coverage are in place.
3. **Platform storage constraint:** the target deployment platform cannot provide
   a reliable mounted volume for the SQLite graph and backup/restore workflow.
4. **High-availability requirement:** tenant requirements demand database-level
   HA, read replicas, or cross-pod failover that SQLite cannot provide.

Chroma saturation, embedding backlog, or KB bulk-ingestion volume pressure do not
by themselves trigger this ADR. Those are vector-store / heavy-maintenance
concerns and must be resolved at that substrate first.

Likewise, ordinary A2A message traffic does not trigger this ADR unless the
graph routing writes themselves are measured as the lock source. Message
concept-extraction pressure belongs to provider scheduling, not graph-backend
selection.

## 5. Rejected Alternatives

| Alternative | Rejection rationale |
|---|---|
| Adopt a networked SQL server now | Negative ROI without graph-specific contention. It adds operational and migration surface while solving the wrong observed bottleneck. |
| Treat `better-sqlite3` as a separate backend decision | `better-sqlite3` is already the current SQLite driver in `Neo.ai.graph.storage.SQLite`; the real decision is SQLite-file topology vs networked database topology. |
| Use Chroma contention as proof that SQLite is insufficient | Wrong substrate. Chroma stores vectors and carries embedding/upsert pressure; the graph store holds structural nodes/edges and already uses WAL. |
| Re-point heavy scheduler work at a SQL server to gain concurrency | Heavy maintenance still needs serialization semantics for Chroma, backups, and LLM-bound digestion. A SQL server does not remove the need for ADR 0009's lease discipline. |

## 6. Consequences

### Positive

- Avoids adding a managed SQL dependency to the current cloud deployment path.
- Keeps backup/restore and deployment docs aligned with the shipped mounted-volume
  graph baseline.
- Preserves the existing `GraphLog` and cache-coherence substrate without a
  migration cliff.
- Converts #11732 from an open-ended "maybe SQL server" residual into a
  falsifiable future trigger list.

### Negative / residual

- SQLite remains a single-file graph store; it is not a horizontal multi-writer
  database.
- Future HA or multi-instance graph requirements still require a fresh backend
  decision and migration plan.
- Operators must separate Chroma/embedding pressure, A2A routing, A2A concept
  extraction, and graph-SQL pressure when diagnosing "Agent OS is busy" symptoms.

## 7. V-B-A Pre-Flight for Future Authors

Before proposing networked SQL for the graph store, verify all of the following:

1. The observed bottleneck is in graph reads/writes, not Chroma vector collection
   operations or embedding work.
2. `journal_mode = WAL` and `busy_timeout = 5000` remain active in
   `Neo.ai.graph.storage.SQLite`.
3. The pressure source is not ordinary A2A message routing, A2A concept
   extraction, or Chroma / embedding work.
4. Heavy-maintenance lease coverage is not the missing fix for the observed
   contention.
5. The proposed SQL backend has a migration plan for `Nodes`, `Edges`,
   `GraphLog`, `SummarizationJobs`, tenant fields, and backup/restore.
6. The deployment target actually needs multi-writer, HA, or platform storage
   semantics SQLite cannot provide.

## 8. Related

- #11732 - graph-store evolution residual resolved by this decision.
- #11730 - post-MVP residual epic.
- #11720 - cloud deployment MVP baseline.
- ADR 0014 - cloud deployment topology and scheduler task taxonomy.
- ADR 0005 - ADR-at-graduation workflow and `ADR_REQUIRED` classification.
- ADR 0009 - cross-daemon heavy-maintenance lease inheritance.
- `ai/graph/storage/SQLite.mjs` - current SQLite graph-store implementation.
- `ai/services/memory-core/MailboxService.mjs` - A2A message graph routing.
- `ai/daemons/DreamService.mjs` - DreamMode REM graph pipeline.
- `buildScripts/ai/runSandman.mjs` - lease-wrapped Sandman REM entry point.
- `learn/agentos/DeploymentCookbook.md` - cloud deployment operator guide.

## 9. Status / Lifecycle

This ADR is the accepted current post-MVP cloud deployment posture once PR
#11779 merges via ADR 0005's PR-merge/content-accuracy gate. Future work may
supersede it only by citing one of the section 4 reopen triggers and producing a
new decision record or amendment.

Origin Session ID: `d60db68f-8ff0-48a6-b168-237ca9dca2a0`

Retrieval Hint: `query_raw_memories("SQLite graph store better-sqlite3 networked SQL Chroma access trouble scheduling resolved #11732")`
