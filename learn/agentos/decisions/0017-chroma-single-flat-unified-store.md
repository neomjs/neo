# ADR 0017: Chroma — Single Flat Unified Store + Dev/Prod Parity

> Architectural Decision Record for Epic #12153. Amends ADR 0003 (Chroma Topology — Unified Only): preserves its one-daemon core decision and records the store's concrete shape — a single FLAT persist store named `unified`, identical local and cloud, with Knowledge Base / Memory Core / tenant separation enforced by collection + metadata + export + backup, never by directory or daemon split. Retires the federated-era two-folder local layout (`knowledge-base/` + the stale `memory-core/`).

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-05-29 (transitions to Accepted on approved, green PR merge at the human merge gate) |
| **Author** | @neo-opus-4-7 (Claude Opus 4.8), grounded in a 6-agent plan stress-test of Epic #12153 + a live store / daemon / cloud-compose audit |
| **ADR classification** | ADR_REQUIRED: governs the physical Chroma persistence layout, the KB-release privacy boundary, and cross-deployment parity — future agents need a graph-queryable decision record |
| **Resolves** | #12154 — *"Author amending ADR"* (sub of Epic #12153) |
| **Amends** | ADR 0003 (Chroma Topology — Unified Only) — preserves its one-daemon decision; adds the flat-store layout + naming + dev/prod-parity + separation-layer model |
| **Touches** | ADR 0014 §2.5 (Cloud Deployment Topology) — its "ADR 0003 needs no amendment" sweep is superseded for the persist-path/layout dimension; the `chroma` = shared-primitive / one-container classification is unaffected |
| **Informs** | Epic #12153 subs #12155 (rename+migrate), #12156 (defrag), #12157 (release-privacy), #12158 (guides) |
| **Anti-anchor for** | Per-realm persist folders; a second Chroma daemon; folder-level KB release artifacts; treating the persist-dir name as the isolation boundary |

---

## 1. Context

ADR 0003 retired the federated (per-subsystem-daemon) Chroma topology in favor of **one daemon**, but recorded the daemon decision without pinning the store's concrete on-disk shape. In the interim the local layout drifted off-piste: the live daemon runs `--path .neo-ai-data/chroma/knowledge-base`, and that single dir now holds **all** realms as distinct collections — `neo-knowledge-base`, `neo-agent-memory`, `neo-agent-sessions`, `neo-native-graph` — while a stale `.neo-ai-data/chroma/memory-core/` dir (a pre-0003 federated leftover) lingers, and ~1,134 leaked `test-*` collections pollute the live store (#12143).

Two problems follow: (a) the persist dir named `knowledge-base` is **misleading** — it holds every realm, so config that reads `dataDir = …/knowledge-base` reads as "Memory Core stores into the Knowledge Base"; (b) the cloud deployment (ADR 0014, `ai/deploy/docker-compose.yml`) runs **one** `chroma` container with a flat volume, so local (two-folder) and cloud (one flat volume) have **diverged** — there is no dev/prod parity.

Critically, the KB ships a release artifact (`uploadKnowledgeBase.mjs`) that every consumer ingests on install. The privacy boundary — Neo's private memories / sessions / graph must never ship; users must ingest the KB without risk to their own Memory Core — was historically a **physical** boundary (the KB lived alone in its dir). Unification dissolved that physical boundary, turning a structurally-safe "zip the KB dir" into a leak risk.

## 2. Decision

**One flat Chroma store named `unified`, identical in shape local and cloud.**

- **One daemon / container** (unchanged from ADR 0003). No per-realm persist folders.
- **Local:** the orchestrator launches the daemon against `.neo-ai-data/chroma/unified`. **Cloud:** the `chroma` container persists to `/chroma/unified` (set via `PERSIST_DIRECTORY` — see §2.2). The leaf name `unified` is identical both sides.
- **Realm / tenant separation is enforced at the layers that exist in every deployment, never by directory or daemon split:**
  - **Isolation** — collection names + per-chunk metadata (tenant isolation via the existing identity-tuple + write-stamping + read-filter model; ADR 0014 + cloud-deployment Overview). Per-collection HNSW indices mean coexistence does not degrade per-collection search (§2.1).
  - **Shipping** — the KB release artifact is a **collection-scoped export** of only the `neo-knowledge-base` collection (reusing the existing `backup.mjs` / `restore.mjs` JSONL SDK), never a directory copy. The privacy boundary becomes a collection boundary the export tooling enforces: it is structurally impossible to ship a Memory Core collection the export does not name.
  - **Recovery** — the **KB-as-cache / MC-as-store** model: the KB is rebuildable from source (`ai:sync-kb`); the irreplaceable Memory Core is protected by backup/restore. Blast-radius is handled by recovery, not by physical daemon isolation.
- The federated-era two-folder local layout (`knowledge-base/` + stale `memory-core/`) is **retired**; local conforms to the cloud reference.

### 2.1 Why one store does not degrade search
ChromaDB HNSW indices are per-collection / per-segment (each segment-UUID dir is an independent `hnswlib` index). A query against `neo-agent-memory` traverses only that collection's graph regardless of how many other collections share the persist dir. The real shared-store costs are metadata-sqlite size (dominated by the #12143 test pollution, not realm coexistence) and write contention — neither requires physical separation.

### 2.2 Cloud persist-path mechanism (verified against chroma 1.5.9 source)
The `chromadb/chroma:1.5.9` image resolves its persist path from `IS_PERSISTENT=1` + a WORKDIR-relative default `persist_directory=./chroma` = `/chroma/chroma`. It does **not** read the volume *mount* path. Persisting to `/chroma/unified` therefore requires setting `PERSIST_DIRECTORY=/chroma/unified` in the compose environment **alongside** the mount — a mount-path change alone silently writes to an ephemeral container layer. Greenfield: no cloud deployment exists yet, so choosing the path now carries no data-migration cost.

## 3. Rejected Alternatives

| Option | Rejection rationale |
|---|---|
| **Two Chroma daemons (one per realm)** | Structurally impossible under the cloud one-container topology (ADR 0014); re-introduces the federated lifecycle complexity ADR 0003 retired. |
| **Two persist folders under one daemon** | ChromaDB serves one `--path` per daemon; "one daemon, two live folders" is not a supported shape. |
| **Keep `knowledge-base` as the store/persist-dir name** | Misleading — it holds every realm; config reads as MC-stores-into-KB. |
| **Folder-level KB release artifact** | Post-unification the dir holds Memory Core collections → a directory copy leaks private data. Collection-scoped export is the only safe shipping mechanism (and the only one that works in cloud, where no KB folder exists). |
| **Drop the cloud rename (logical-only parity)** | Considered while assuming existing cloud data; with no deployment yet the rename is risk-free, so literal parity (`unified` both sides) is chosen over leaving the cloud path at the confusing image default. |

## 4. Consequences

### Positive
- Dev/prod parity — one store shape everywhere; the local layout stops diverging from the cloud reference.
- The privacy boundary is structural (a collection the export names), not a fragile path string one edit away from a leak.
- Honest naming; the stale `memory-core` debt folder is retired.

### Negative / handoffs
- A one-time **local** data migration (the operator's machine holds the only live store, with the irreplaceable MC physically inside `knowledge-base/`): daemon-quiesce (`withHeavyMaintenanceLease`) → backup → atomic same-FS rename → verify → delete stale `memory-core/`. Owned by #12155. This is data-preservation of the one live store, not backwards-compat (no deployments exist; v13 permits breaking changes).
- The cloud compose MUST set `PERSIST_DIRECTORY` (not just the mount). Owned by #12155.
- The KB release pipeline must become collection-scoped. Owned by #12157.

## 5. Boundary — what this ADR does NOT decide
- The migration script + the per-file rename edits — #12155.
- The defrag collection-group changes (including adding `neo-native-graph` to the MC target) — #12156.
- The collection-scoped release export implementation — #12157.
- Multi-tenant KB-collection HNSW scaling (all tenants share one `neo-knowledge-base` collection, metadata-filtered) — a separate future axis if it becomes a perf concern.

## 6. Related
- **Amends:** ADR 0003 (Chroma Topology — Unified Only)
- **Touches:** ADR 0014 §2.5 (Cloud Deployment Topology)
- **Epic:** #12153 · **Resolves:** #12154 · **Informs:** #12155, #12156, #12157, #12158
- **Companions:** #12143 (test-pollution → ephemeral store), #12152 (the `engines.chroma.dataDir` SSOT foundation), #12139 (orchestrator owns the one daemon)
- **Substrate:** `ai/config.template.mjs`, `ai/daemons/orchestrator/TaskDefinitions.mjs`, `ai/deploy/docker-compose.yml`, `ai/scripts/maintenance/{defragChromaDB,uploadKnowledgeBase,downloadKnowledgeBase,backup,restore}.mjs`

## 7. Status / Lifecycle
Proposed until the introducing PR is approved, green, and merged at the human merge gate. Re-review trigger: any change that re-introduces a per-realm persist folder, a second daemon, or a directory-level KB artifact MUST cite this ADR.

Origin Session ID: efd8dc2e-2052-4089-814a-ab22cd8c6a62

Retrieval Hint: query_raw_memories("chroma single flat unified store dev prod parity ADR 0017 persist directory")
