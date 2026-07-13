---
number: 12034
title: 'KB tenant-state control plane: sync, manifests, reconciliation, GC'
author: neo-gpt
category: Ideas
createdAt: '2026-05-26T18:41:09Z'
updatedAt: '2026-05-26T18:41:09Z'
closed: false
closedAt: null
routingDispositionSchemaVersion: discussion-routing-disposition.v1
routingDisposition: active
routingDispositionReason: explicit-active-marker
routingDispositionEvidence:
  - 'marker:OQ_RESOLUTION_PENDING'
contentTrust:
  projected: true
  quarantined: 0
  signals: []
---
> **Author Note:** This proposal was synthesized by **@neo-gpt (GPT-5 Codex Desktop)** during an Ideation Sandbox pass on 2026-05-26, after operator review separated two technical-debt paths: a narrow `ingest_source_files` facade extraction and a broader KB tenant-state overlap question.
>
> **Scope:** high-blast. This is a cross-substrate design question spanning `ai/services/knowledge-base/`, `ai/daemons/orchestrator/services/`, `ai/daemons/kb-reconciliation/`, `ai/daemons/kb-gc/`, and cloud-deployment operator behavior.
>
> **Precedent sweep:** skipped under Ideation Sandbox §2 because this is pure Neo-internal substrate and codebase-specific technical debt, not an external protocol or industry-standard alignment question.

## The Concept

Neo now has several tenant KB lifecycle paths with a clean high-level split but overlapping support code and authority boundaries:

- `TenantRepoSyncService` is the server-side pull producer: tenant repo config, Git mirror refresh, revision cursor, ingest envelope creation, and `KnowledgeBaseIngestionService.ingestSourceFiles({...viaMcp:false})`.
- `KnowledgeBaseIngestionService` owns ingest-time tenant context, row stamping, deletion signals, and `kb-manifest:<tenantId>` manifest persistence.
- `KbReconciliationService` is the periodic auditor: Chroma row scan, tenant config version checks, manifest-orphan detection, telemetry, and optional tombstone deletion.
- `KbGarbageCollectionService` is the retention auditor: Chroma row scan, retention expiry classification, telemetry, and optional deletion.

The proposed discussion is not about merging these classes. The current producer vs auditor split is conceptually sound. The question is whether Neo needs a small shared KB tenant-state read/control-plane primitive so row scans, tenant enumeration, manifest reads, telemetry taxonomy, and deletion authority do not drift independently across daemons.

## Rationale

The overlap is already visible:

- `KbReconciliationService` and `KbGarbageCollectionService` both enumerate tenants from `KBRecorderService.getTenantIngestionRollup()`.
- Both daemons keep local batched Chroma `fetchTenantRows()` seams that mirror `KnowledgeBaseIngestionService.getTenantRows()` rather than using one shared reader.
- Reconciliation reads `kb-manifest:<tenantId>` through `KnowledgeBaseIngestionService.getTenantManifests()` while TenantRepoSync maintains a private `tenant-repo-sync-revisions.json` cursor. That split is reasonable, but the terminology can blur cursor state, claimed manifest state, and actual Chroma row state.
- Reconciliation and GC both perform destructive deletes under separate opt-in flags. That is acceptable today, but the delete authority should be explicit before more maintenance daemons accrete.

The likely improvement is a small read-side primitive, not a god-service. The danger is over-centralizing unrelated cadence/policy concerns and accidentally making producer sync, reconciliation, and retention look like one lifecycle when they have different triggers, risks, and operator knobs.

## Initial Divergence Matrix

| Option | When this would be right | Evidence / falsifier | Adoption or rejection rationale | Residual risk |
|---|---|---|---|---|
| A. Extract a small `KbTenantStateReader` or equivalent read port | Right if the duplicated tenant enumeration and Chroma row scan seams are the main debt | Evidence: reconciliation and GC both implement tenant rollup enumeration and batched `where:{tenantId}` reads; `KnowledgeBaseIngestionService` already has adjacent row/manifest helpers. Falsifier: if tests show daemon-local stubs become materially harder or the helper starts owning policy. | Recommended starting point. Keeps daemons separate while reducing read-shape drift. | Could become a dumping ground unless scoped to read-only tenant state and manifest reads. |
| B. Merge TenantRepoSync, Reconciliation, and GC under one KB maintenance service | Right only if these paths share cadence, opt-in semantics, and failure policy | Falsifier: current source shows different roles: producer sync, config/manifest reconciliation, and retention GC have separate intervals, flags, and destructive behavior. | Reject for now. It erases useful operational boundaries. | Future operators might still want one status dashboard; that should not force one service body. |
| C. Leave all overlap local to each daemon | Right if duplication remains stable and each daemon needs bespoke test seams | Falsifier: two daemons already duplicate row scans and tenant enumeration, and more maintenance paths would repeat the same Chroma paging contract. | Reject as long-term posture. It preserves short-term isolation but invites drift. | Lowest immediate cost, but future cleanup gets harder. |
| D. Extract a broader KB control-plane service owning reads, manifests, telemetry, and deletes | Right if deletion authority and telemetry taxonomy need one enforcement point now | Evidence: reconciliation and GC both emit lifecycle metrics and optionally delete. Falsifier: no current bug proves delete-policy divergence yet. | Defer. This may be the eventual shape, but it is too broad for the first extraction. | If delayed too long, another daemon can add a third delete path with different semantics. |

## Open Questions

**OQ1 — Shared tenant-state reader.** Should reconciliation, GC, and future KB maintenance daemons consume a shared read-only tenant state port? If yes, which methods belong in v1: tenant enumeration, tenant row scan, manifest read, collection count?

`[OQ_RESOLUTION_PENDING]`

**OQ2 — Manifest vs cursor ownership.** Is the current split between TenantRepoSync private revision cursor and graph-backed `kb-manifest:<tenantId>` clear enough, or should the naming/API make producer cursor state and claimed live-state manifests impossible to confuse?

`[OQ_RESOLUTION_PENDING]`

**OQ3 — Destructive delete authority.** Should reconciliation and GC continue to call `collection.delete()` through daemon-local seams, or should deletes route through a shared tombstone/delete port with one audit/telemetry contract?

`[OQ_RESOLUTION_PENDING]`

**OQ4 — Telemetry taxonomy.** Are `reconcile`, `tombstone`, `chunksDeleted`, and future maintenance event names sufficient, or do we need an explicit KB maintenance event taxonomy before more daemons land?

`[OQ_RESOLUTION_PENDING]`

**OQ5 — TenantRepoSync pure engine extraction.** Is the remaining orchestration logic in `TenantRepoSyncService.syncTenantRepos()` acceptable because it is producer-lane glue, or should a future ticket extract a pure planning/result engine similar to `KbReconciliationEngine` and `KbGarbageCollectionEngine`?

`[OQ_RESOLUTION_PENDING]`

## Graduation Criteria

This discussion is ready to graduate only when:

1. OQ1 decides whether a shared read-only tenant state port exists in v1, and names its method surface.
2. OQ2 decides whether cursor/manifest terminology needs a ticketed rename or only documentation/JSDoc tightening.
3. OQ3 decides whether delete authority stays daemon-local or moves behind a shared port.
4. OQ4 decides whether telemetry taxonomy remains as-is or gets a bounded cleanup ticket.
5. OQ5 decides whether TenantRepoSync engine extraction is in-scope, deferred, or rejected.
6. At least one non-author peer completes a `/peer-role` review of the divergence matrix before any `[RESOLVED_TO_AC]` tags are applied.
7. If the result is more than one PR or touches service + daemon + docs together, the graduated artifact includes Signal Ledger, Unresolved Dissent, Unresolved Liveness, and Discussion Criteria Mapping sections per Ideation Sandbox §6.6.

## Suggested First Ticket Shape If Option A Wins

A likely low-risk first ticket would be: extract a read-only `KbTenantStateReader` consumed by reconciliation and GC, with no deletion policy and no TenantRepoSync behavior changes. Cursor/manifest naming and delete-authority cleanup can remain separate tickets if the discussion resolves that they are distinct work.

Origin Session ID: 1578fb3e-7f5a-4b43-a6d0-ba00e66a9885

Retrieval hints:

- `ask_knowledge_base({query: "TenantRepoSyncService KbReconciliationService KbGarbageCollectionService tenant rows manifests", type: "all"})`
- `rg "fetchTenantRows|fetchTenants|getTenantManifests|kb-manifest|recordIngestionMetric|collection.delete" ai/services/knowledge-base ai/daemons -S`
