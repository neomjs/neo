# ADR 0006: ADRs as Graph-Queryable Entities via Specific `ADR` Label

> Architectural Decision Record promoting ADRs from documentation-only artifacts to first-class graph-queryable entities via a new specific `ADR` graph node label. Authority artifact for the ADR-as-graph-entity decision; companion implementation work tracked in #11377.

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-05-15 (operator content-accuracy verified) |
| **Author** | @neo-opus-4-7 drafting; architecture authored by swarm via Discussion #11374 (3× APPROVED Cycle 4-5, RESOLVED 2026-05-14T21:33:39Z) across 5-cycle divergence-pressure arc |
| **Graduated from** | Discussion #11374 — *"Promote ADRs to first-class graph entity with N-to-N concept relationships"* |
| **Implementation ticket** | #11377 — *"Implement ADR 0006: ADRs as Graph-Queryable Entities (specific ADR label)"* |
| **Supersedes** | (a) Implicit assumption that ADRs as documentation-only artifacts could surface in graph queries; (b) Cycle 1 Option B framing (specific ADR type without V-B-A on graph-label cost); (c) Cycle 2 Option E framing (generic `DOCUMENT` node — falsified by V-B-A on `GraphService.mjs` line 149) |
| **Informs** | DreamService Phase 4 Apoptosis predicate update; Phase 5 Golden Path ADR-authority weighting; KB ADR type filter (#11373); future Sandbox #11375 bird's-eye strategic-tier consumer; `ticket-intake` skill V-B-A target lookup |
| **Anti-anchor for** | Substrate-bypass at execution time when ADR authority is not graph-visible (#11362 empirical anchor) |

---

## 1. Context

PR #11362 (commit `559c73d43`, 2026-05-14) deleted 3,366 archived items as "legacy" instead of reshaping them per Epic #11187 Phase 3 ACs. Root cause: ADR-authority artifacts existed (Discussion #11180 → Epic #11187 → Discussion #11359 graduation chain), but they were NOT graph-visible — DreamService Golden Path math operated on ISSUE-level priority without ADR-authority weighting; DreamService Phase 2 conflict detection couldn't reference ADR §5 anti-patterns; future-agent V-B-A had no graph-queryable authority target.

**ADR-as-graph-entity is the substrate condition for ADR-authority-weighting** in Golden Path math + DreamService conflict detection + future Sandbox #11375 bird's-eye strategic-tier reasoning.

---

## 2. Decision

ADRs become first-class graph-queryable entities via **one new specific graph node label `ADR`** (NOT a generic `DOCUMENT` node with metadata-typing). Ingested deterministically (no LLM-extraction prompt widening). Linked to existing `CONCEPT` ontology + `ISSUE` / `PR` / `SESSION` / `FILE` nodes via consumer-backed edge taxonomy.

### 2.1 Schema decision

**One new label**: `ADR`. Specifically NOT:
- A generic `DOCUMENT` node with `metadata.documentType='adr'` (Cycle 2 Option E — falsified by V-B-A on `GraphService.mjs` line 149)
- A `GUIDE` sub-type (different consumer semantics — authority-tier vs learn-by-reading)
- A `CONCEPT` sub-shape (operator-direct refutation: ADR ⊥ Concept; N-to-N not parent-child)

### 2.2 Critical V-B-A: graph node types are labels, not SQL schemas

`ai/services/memory-core/GraphService.mjs` lines 149, 164, 227:

```
Line 149: @important The `type` string is mapped directly to `node.label` to
          comply with strict Graph Database taxonomy (Node Labels).
Line 164: const updatedLabel = type || currentLabel || 'NODE';
Line 227: label     : type || 'NODE',
```

**Implication:** adding a new node "type" is a label addition — cost negligible (no migration, no schema-change PR, no data backfill). The "perpetual schema bloat" framing initially used to reject Option B (Cycle 1 → Cycle 2 yield) was based on a SQL-schema-cost premise that does NOT apply to this graph substrate.

### 2.3 Boundaries

- **No reclassification** of existing `GUIDE` / `BLOG` / `TEST` node labels
- **No DreamService Tri-Vector `VALID_TYPES` enum widening** — `ADR` nodes ingested by deterministic file-path scanner (sibling-pattern to `ConceptIngestor`); LLM Phase 1 extraction prompt unchanged
- **Future doc-tier additions** (`RFC`, `POST_MORTEM`, `TECH_SPEC`, etc.) — each gets its own label per the first-class-authority-artifact gate established in #11373. Explicit + reviewable; no silent enum-growth.
- **Pinned `metadata` shape** per ADR node: `{status: 'Draft' | 'Accepted', adrNumber: NNNN, title, supersedes?: [...]}` — extracted from frontmatter + body

### 2.4 Edge taxonomy (consumer-backed)

| Edge | Direction | Consumer |
|---|---|---|
| `GOVERNS` | ADR → ISSUE | Golden Path authority-weighting |
| `IMPLEMENTS_DECISION` | PR → ADR | Implementation-attribution + V-B-A reverse-lookup |
| `GRADUATED_FROM` | ADR → SESSION | Origin trail for Discussion-graduated ADRs |
| `CITES_AUTHORITY` | ISSUE → ADR | V-B-A target lookup in `ticket-intake` skill |
| `CODIFIES_CONCEPT` | ADR → CONCEPT | Concept-authority enrichment (existing CONCEPT ontology) |

Each edge has a named consumer. No speculative edges.

### 2.5 Apoptosis protection

`GraphService.getOrphanedNodes()` MUST exclude nodes WHERE `type='ADR'`. ADR nodes are durable authority — they should never be decay-eligible orphans, even if temporarily lacking inbound/outbound edges during normal graph evolution.

---

## 3. Implementation Details

### 3.1 Deterministic ingestion

New `ai/daemons/services/AdrIngestor.mjs` sibling to existing `ConceptIngestor.mjs`:
- Scans `learn/agentos/decisions/0NNN-*.md`
- Parses frontmatter + body for metadata (`status`, `adrNumber`, `title`, `supersedes`)
- Emits `ADR` graph nodes via `GraphService.upsertNode({type: 'ADR', ...metadata})`
- Emits 5 consumer-backed edges per §2.4 by parsing Related section + Fix section file:line refs + body cite-patterns

### 3.2 Apoptosis predicate update

`ai/services/memory-core/GraphService.mjs#getOrphanedNodes()` predicate update:
- Excludes `WHERE type='ADR'` from orphan-eligible set
- Regression test proving ADR nodes are NOT returned even when orphaned

### 3.3 DreamService Phase 4 integration

Phase 4 Apoptosis sweep respects the updated predicate; no Phase 1 LLM-extraction prompt change.

### 3.4 Golden Path multiplier (deferred)

Specific multiplier value TBD via empirical post-merge tuning (≤30 days post-#11377 merge). Implementation MUST be parameter-driven (config-tunable), not hardcoded.

---

## 4. Consequences

### Positive

- **ADRs become V-B-A targets in graph queries** — `WHERE type='ADR'` is grep-friendly + self-documenting
- **Apoptosis safety preserved** — durable authority cannot be accidentally decayed via orphan-cleanup
- **Future doc-tier extensions remain reviewable** — each new label requires explicit first-class-authority justification (no silent enum-growth)
- **No LLM-prompt-bloat** — deterministic ingestion sibling-pattern keeps the 14-type extraction enum stable
- **Bird's-eye Sandbox #11375 substrate condition met** — strategic-tier reasoning can query ADR authority via graph

### Negative

- **Implementation cost** — new `AdrIngestor.mjs`, `GraphService` predicate update, DreamService Phase 4 wiring, regression tests
- **Specific-label boundary requires discipline** — future doc-tier additions (RFC, post-mortem) must justify their first-class-authority status per #11373 boundary; without that discipline, label-proliferation could happen anyway
- **Golden Path multiplier value is post-impl empirical work** — initial implementation lands without the optimal weighting; tuning follows

---

## 5. Anti-Patterns (Substrate-Bypass Prevention)

### 5.1 Treating graph node types as SQL schemas

The "perpetual schema bloat" concern that drove Cycle 2 Option E was based on a SQL-schema-cost premise. **Graph node types map to labels (per `GraphService.mjs` line 149); adding labels is essentially free.** Future agents authoring graph-schema decisions MUST V-B-A the actual cost mechanism before invoking schema-bloat-prevention reasoning.

### 5.2 Yielding to peer framing without V-B-A

This ADR's Cycle 2 yield to Option E (generic `DOCUMENT`) was wrong because it accepted Gemini's schema-bloat framing without V-B-A'ing the underlying cost premise. The framing resonated; the resonance was the failure-mode trigger. **Pattern: framing that resonates with training-prior (e.g., "minimal schema = good") gets accepted as load-bearing without empirical verification.** Distinct from §3.5 V-B-A core value (which targets public-artifact assertions) — applies specifically to *internal yields during peer divergence*.

### 5.3 Treating authority-tier graph entities as decay-eligible orphans

ADR nodes are durable authority. Apoptosis predicates MUST exclude them. Future apoptosis-rule changes that don't preserve this exclusion are wrong-shape — codify the exclusion explicitly in predicate code + regression tests.

### 5.4 Silent doc-type enum growth

If `metadata.documentType` were used (Cycle 2 Option E), future doc-tier additions could silently grow the enum without first-class-authority justification. The specific-label approach (Option F) makes each addition explicit + reviewable.

### 5.5 LLM-extraction prompt widening for deterministic-ingestion-eligible types

Adding `ADR` (or any deterministic-ingestion-eligible type) to DreamService Phase 1 `VALID_TYPES` is wrong-shape — it bloats the LLM prompt without capability benefit, since deterministic ingestion is more reliable than LLM-extraction for file-path-derivable types.

---

## 6. V-B-A Pre-Flight for Future Authors

Before authoring code that touches the ADR graph substrate, you MUST:

1. Read this ADR start-to-finish
2. Read `ai/services/memory-core/GraphService.mjs` §`upsertNode` (line ~149 — labels not SQL schemas)
3. Read `ai/daemons/services/ConceptIngestor.mjs` (sibling-pattern source)
4. Verify `GraphService.getOrphanedNodes()` predicate excludes `WHERE type='ADR'`
5. V-B-A any new doc-tier label proposal against the first-class-authority-artifact boundary (per ticket #11373 framing)
6. Cite this ADR in any PR body touching `ADR` graph nodes or edge taxonomy

---

## 7. Related

- **Discussion #11374** — graduated; this ADR's authority origin; 5-cycle divergence-pressure arc + 3× APPROVED Signal Ledger
- **Ticket #11377** — implementation/planning artifact; merge-blocked until this ADR `Accepted`
- **ADR 0005** — ADR-at-Graduation workflow; Discussion #11374 self-classified as `ADR_REQUIRED` per ADR 0005
- **ADR 0004** — Universal Ordinal-100 Content Architecture; substrate-bypass empirical anchor (#11362)
- **Ticket #11373** — KB ADR + concept content types; sequenced predecessor (KB substrate)
- **Sandbox #11375** — Bird's-Eye Strategic Awareness Layer; downstream consumer of ADR graph queryability
- **Sandbox #11376** — Temporal-Pyramid Summarization Substrate; orthogonal sibling
- **`ai/daemons/services/ConceptIngestor.mjs`** — sibling-pattern source for `AdrIngestor.mjs`
- **`ai/services/memory-core/GraphService.mjs` line 149** — V-B-A anchor (graph types are labels, not SQL schemas)

---

## 8. Status / Lifecycle

- **Accepted** (operator content-accuracy verified and explicitly authorized in harness prior to merge)
- **Periodic re-review trigger:** any future PR amending `GraphService.mjs#getOrphanedNodes()` predicate OR adding new doc-tier labels MUST cite this ADR in body; reviewer-side audit fires if absent
- **Post-merge validation:** Golden Path multiplier empirical tuning ≤30 days post-#11377 merge

Origin Session ID: `cf76b29a-9cf5-4c35-a415-37d631a8a755`

Retrieval Hint: `query_raw_memories("ADR graph label specific Cycle 4 Option F GraphService line 149 framing-resonance")` or commit-range anchor on this ADR's first commit
