# ADR 0023: DreamService Organism — Map-Fidelity + Consolidation-Liveness

> Architectural Decision Record for the DreamService Brain as a single **organism**: two decoupled orchestrator tasks (digest + synthesize) governed by **two coupled invariants** — Map-Fidelity (the forecast reflects where the swarm has actually been) and Consolidation-Liveness (the dream observably lays every trail, or visibly records the gap). Both are facets of one principle: the Golden Path is trustworthy **only because it is earned-and-forgetting**. Graduated from Discussion #13802. The DreamService graph edges are **synapses ∧ pheromone trails** — laid by real swarm work (Hebbian `linkNodes` reinforcement), evaporating on their own (stigmergic `decayGlobalTopology`), pruned when the scent dies. Structural weight is *deposited scent*, never assigned.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-06-21 (graduated from Discussion #13802; §6.2 family-keyed quorum met — Claude/Opus signals [grace + Vega] + GPT-family `[GRADUATION_APPROVED]` on the final 19:24 body; §5.2 Step-Back posted by @neo-gpt. Human merge gate per ADR-0005 lifecycle.) |
| **Author** | @neo-opus-grace (Grace, Claude Opus 4.8) body-driving; co-authored with @neo-opus-vega (spine + prior-art + consolidation-liveness V-B-A); substrate-truth grounded in a full read of `ai/services/graph/*` + `DreamService.mjs` + `runSandman.mjs` + the live `sandman_handoff.md`, audited at `dev` |
| **Resolves** | #13805 — *"DreamService organism ADR: map-fidelity + consolidation-liveness"* (graduated from Discussion #13802) |
| **Graduated from** | Discussion #13802 (*DreamService as Organism: the Map-Fidelity invariant for the Golden Path*); builds on Discussion #9887 (*Swarm Intelligence: Karpathy Loop & Graph Stigmergy* — the stigmergy + Hebbian-decay source) |
| **Depends on** | ADR-0009 (cross-daemon lease — consolidation runs under it), ADR-0014 (scheduler task taxonomy — the dream/golden-path lanes' deployment class), ADR-0019 (config SSOT — every tuning leaf extends an existing `leaf()`), ADR-0022 (REM-fairness — consolidation scheduling). The organism is the **Brain pillar** of ADR-0020. |
| **Connects to** | **ADR 0024 (#13814) — the Native Edge Graph *model*** (the composed node/edge ontology + active MC interface + storage composition + provenance that this ADR *governs*). Boundary: **0024 = the model** (what the graph IS); **0023 = the governance** (the invariants it must obey). The active-steering surface (§2.3 e) is the *governance* of `mutate_frontier`; 0024 catalogs its *interface* — split by capacity, not by tool. |
| **Implemented by** | #13801 (sub-decision a — frontier recency-sort, ✅ APPROVED), #12439 (sub-decision d — over-band semantic-fidelity, gated), the honest-consolidation-gap leaf (sub-decision d, map-fidelity-pure), #13624 (execution/proof of consolidation-liveness) |
| **Anti-anchor for** | A static label-boost folding visibility into routing (synthetic scent); assuming consolidation health from a fresh handoff (green-but-rotting); re-building the rejected deterministic-reduce-only floor (#12423) |

---

## 1. Context

The DreamService is the Brain's forecasting engine — it digests episodic session memory into a Native Edge Graph and synthesizes the **Golden Path**, an advisory forecast peers read and lay more trails onto (stigmergic coordination, not negotiation). Two structural facts, both verified at `dev`, motivate this ADR:

1. **It is two decoupled tasks, not one pipeline** (decoupled by #13783): **CONSOLIDATION** (`DreamService.executeRemCycle` = extraction + `decayGlobalTopology`, *the dream lays the trails*) runs as sessions arrive; **FORECAST** (`GoldenPathSynthesizer.synthesizeGoldenPath`, a separate hourly task, *the swarm reads the world-model it woke with*) reads accumulated graph state. The forecast does **not** re-consolidate; the consolidation does **not** synthesize.

2. **A string of "correct-by-luck" frictions shared one missing north-star.** The live `sandman_handoff.md` (2026-06-21T18:07) showed the Computed Golden Path = `issue-9864` **alone** (Semantic 1.15 ≈ distance 0.77 far-from-frontier, Structural 10.00 old accumulated), while the actual current PRIO-ZERO work (#13750) surfaced only in a visibility section. Separately, `get_rem_pipeline_state` (~19:13) showed **316 undigested sessions + `recentCycles=[]`** — the orchestrator alive and the forecast fresh, but the consolidation half silently stalled. The two symptoms are the same defect in two halves: **the map lying about where the swarm has been.**

**Substrate audited at `dev`:** `ai/services/graph/{GoldenPathSynthesizer,SemanticGraphExtractor,sessionChunker,TopologyInferenceEngine,GapInferenceEngine,GraphMaintenanceService,providerReadinessHelper,providerDispatch}.mjs`, `ai/daemons/orchestrator/services/DreamService.mjs`, `ai/scripts/runners/runSandman.mjs`, `ai/agent/AgentOrchestrator.mjs`, the live `resources/content/sandman_handoff.md`.

## 2. Decision

### 2.1 The Brain is one organism, the edges are dual-nature

The Native Edge Graph is a **brain with swarm aspects**. Each edge is a **synapse ∧ pheromone trail at once**: laid by real swarm work (`linkNodes` reinforcement — Hebbian fire-together-wire-together), evaporating on its own (`decayGlobalTopology` — geometric decay per 24h, prune < 0.2), pruned when the scent dies. **Structural weight is *deposited scent* — never a *permanent* assignment** (the discriminator is decay, not provenance: see sub-decision (e)). **Decay applies to *scent*** — relevance signals, whether *earned* via Hebbian reinforcement or *injected* via `mutate_frontier`; the current `PROTECTED_EDGE_TYPES` set (`ADVANCED_BY`, `ATTRIBUTED_TO`, `IMPLEMENTS`, `EXTENDS`, `SYSTEM_TENET`, `RESOLVES`) never decays, because those edges are structural, measurement, or historical *facts* (V-B-A'd: excluded from both `decayStmt` and `pruneStmt` in `GraphService`). The discriminator is *decay-among-scent*; facts are a separate, permanent category — so the rejected boost is forbidden as a *non-decaying scent-injection*, while protected fact edges are correctly permanent. Source-projected concept membership is orthogonal: a concept edge instance and its weight may decay away, then be re-derived from a still-declared JSONL tuple without making that edge type protected. REM/dream is the overnight **consolidation** of the episodic day into the trail-landscape; the Golden Path is the world-model the swarm wakes with; coordination is **stigmergic** — peers read the trails and lay more.

### 2.2 Two coupled invariants — both earned-and-forgetting

> **(1) Map-Fidelity (forecast).** The Golden Path must faithfully reflect where the swarm has *actually been* — no synthetic trails, no lost walks, read from the true current position, with abandoned trails forgotten. The forecast is trustworthy **only** because it is earned-and-forgetting; **decay is the forgetting that keeps the map honest**, not garbage collection.
>
> **(2) Consolidation-Liveness (dream).** Every session must **deposit a trail, or be visibly recorded as un-depositable** — never silently undigested. Liveness is **observable, never assumed-green**. A forecast reading the true position is worthless if the consolidation that lays the trails has silently stalled: `forecast-fresh-but-graph-rotting = health-green-but-map-lying`.

The two are duals: (1) governs the read, (2) governs the write. Together they are the one law — *the map must never lie about where the swarm has been* — and every design decision below serves it.

### 2.3 The five sub-decisions (each a map-fidelity boundary, with its resolution)

- **(a) Frontier-baseline-vector contract — RESOLVED.** The frontier (the candidate-pool semantic anchor) MUST be the recency-ordered most-recent-N session summaries by timestamp metadata, **not** `summaryColl.get({limit:2})` storage-order (which read the map *from the wrong position*). Shipped: **#13801** (`getRecentSummaryDocuments`, recency-sorted, ✅ APPROVED).
- **(b) Routing-vs-visibility two-surface boundary — RESOLVED.** The **Computed Golden Path is earned-scent routing**; **Current-Focus / Silent-Threads / Backlog are intentional-pointing visibility** (local-sync release/incident signal, explicitly *not* graph-centrality routing). **Consumer-contract AC:** every consumer of `sandman_handoff.md` MUST declare its mode — `computed-routing` | `visibility-only` | `both-with-separate-semantics` — and no consumer may fold a visibility section into routing. **Structural guard (V-B-A'd):** the candidate-pool `state = 'OPEN'` SQL filter (`synthesizeGoldenPath` L1108) makes routing OPEN-issue-only by construction (CONCEPT/ADR/closed nodes excluded — the 2026-06-21 live snapshot's 19,513 CONCEPT + 23 ADR nodes were `state=NULL`); `AgentOrchestrator.parseGoldenPath` (L93) consumes routing-only. The rejected current-focus *boost* is the anti-pattern: synthetic scent makes the map lie.
- **(c) Vector-sharing granularity — DEFERRED-WITH-MEASUREMENT.** Session-extracted nodes share `semanticVectorId: session.id`; same-vector clustering can dilute the top-20 candidate pool (the real candidate-pool-fidelity lever, NOT the inert CONCEPT/ADR ontology). Re-open to measure on the live handoff after #13801 merges + the digest backlog drains.
- **(d) Over-band session fidelity + the honest-consolidation-gap — GATED + LEAF.** The deterministic-reduce floor was **built-and-rejected** (PR #12423, CHANGES_REQUESTED, closed 2026-06-06); the canonical authority for the semantic-fidelity re-approach is **Discussion #12439** (@neo-opus-ada), gated on latency (OQ1, `gemma4-rem-benchmark` pending — #10019's 30-60min revert is the ghost) + semantic-fidelity (OQ6). A **map-fidelity-pure leaf** (decoupled from #12439) serves consolidation-liveness directly: over-band/aborted sessions MUST surface as a **visible consolidation-gap** in the handoff (honest trail-loss), never silently absent.
- **(e) Active-steering surface — RESOLVED (mechanism V-B-A'd).** `mutate_frontier` injects a high-weight `STRATEGIC_PIVOT` edge (`[Frontier]` → target; the `MemoryService.mutateFrontier` / `GraphService.mutateFrontier` default relationship), read by `getContextFrontier` into the Strategic Brief. **KEY:** `STRATEGIC_PIVOT` is **not** in `PROTECTED_EDGE_TYPES`, so it **decays + prunes** like any scent. So `mutate_frontier` **assigns but decays** = *legitimate active-steering* — the **3rd surface** alongside the two-surface boundary (b): **routing** (earned scent) / **visibility** (intentional pointing, no graph deposit) / **active-steering** (intentional deposit that *decays*). This closes two exploits: re-justifying the rejected boost via `mutate_frontier` (the boost is *non-decaying*; `STRATEGIC_PIVOT` decays), and wrongly flagging `mutate_frontier` as a "never assigned" violation (the discriminator is **decay, not provenance**).

### 2.4 Binding constraints (graduation ACs)

- **AC-1 (two invariants explicit).** The ADR records *both* map-fidelity and consolidation-liveness, so a forecast-fresh / consolidation-stale state cannot look healthy (per @neo-gpt's graduation requirement).
- **AC-2 (no synthetic scent).** No consumer folds visibility into routing; the `state='OPEN'` structural guard + the consumer-contract declaration enforce it.
- **AC-3 (observability over assumption).** Consolidation-liveness rides a durable observable signal (the 3 backlog classes: over-band/#12439, lease-starve/#13624, observability/#13551); never assumed-green.
- **AC-4 (no boost, no rejected-floor rebuild).** The rejected deterministic-reduce-only floor (#12423) and the current-focus boost (#13793, dropped) are anti-anchors, not escalation paths.

### 2.5 The Knowledge-Graph Layer + Target-vs-Current State

An ADR must name the **target** architecture *and* the **current** state, per layer (operator requirement) — otherwise the structural audit reports *selective-by-design* absences as "gaps" and a fresh agent chases false gaps (the same map-lie that made the swarm chase old meta-hubs). The organism has a third layer beyond forecast + consolidation: the **knowledge-graph** (CONCEPT + ADR nodes), and its map-fidelity rule is the same — the handoff must not report intended-selectivity as failure.

**Knowledge-graph semantics (operator-corrected mental model):**
- **CONCEPT nodes are a *selective* bridge guides↔source** — NOT every source file needs a guide, and not every concept needs an implementation. The version-controlled source currently has **65 concept rows** and **182 relationship declarations**: 59 validated code-layer concepts plus six `validated:false` process/MX candidates produced by the scheduled message harvester; all 65 carry `verifiedAt:null`. The explanation-content layer remains 59 independently maintained `resources/content/concepts/*.md` files, so the old 59↔59 coincidence was not a source/projection invariant. Separately, the private runtime graph's dated 2026-07-09 search-population snapshot contained **22,446 CONCEPT nodes, 19,166 marked auto-extracted**. That historical broad population is not the deliberate hierarchy and does not describe the current discovery write path: `MailboxService` no longer invokes inline inference; the orchestrator now drains bounded batches through `ConceptDiscoveryService`, whose proposals enter JSONL as unvalidated candidates. Gap inference skips `validated:false` rows and applies the configured weight gate to promoted code-layer concepts. **Map-fidelity for the knowledge layer must name which cohort it measured** — version-controlled source, runtime projection of that source, or broad historical search population — else a fresh agent chases false gaps.
- **ADR nodes are roadmapped for first-class insertion.** Current: `AdrIngestor` inserts ADR nodes but they carry no `semanticVectorId` (the live graph's 23 ADR nodes are un-embedded → inert to the candidate pool). Target: ADR nodes embedded + first-class (queryable as architectural anchors in their own right).

**Target-vs-Current (per layer):**

| Layer | Current | Target |
|---|---|---|
| **Forecast (map-fidelity)** | frontier storage-order (pre-#13801) surfaced old structural hubs (`issue-9864` alone) | frontier reads the true position; current #13k work surfaces by legitimate semantic proximity |
| **Consolidation (liveness)** | 316 undigested, `recentCycles=[]` — silent stall (`forecast-fresh-but-graph-rotting`) | every session deposits a trail or is visibly recorded un-depositable; drain observable |
| **Knowledge-graph (selectivity)** | 65 version-controlled rows (59 validated code + 6 unvalidated process/MX) and 182 relationship declarations; 59 independent explanation files; dated runtime search population 22,446 / 19,166 auto-extracted; JSONL source membership projected into SQLite while live salience decays | audit names its cohort and verifies source→projection integrity; content-SSOT de-duplicated; ADR nodes first-class / embedded |

**V-B-A note (2026-07-13):** `nodes.jsonl` has 65 rows (59 treated as validated code-layer concepts + six explicit `validated:false` process/MX candidates), `edges.jsonl` has 182 rows, and `resources/content/concepts/` has 59 Markdown files. The gap-inference exclusions are explicit in `GapInferenceEngine` (`validated:false`, `ontologyLayer:process-mx`, `codeGapEligible:false`, then the weight gate). The 22,446 / 19,166 figures are a dated 2026-07-09 private-graph measurement, not a live/public count. `nodes.jsonl` is not derived from the Markdown content, while SQLite is a runtime projection of the JSONL source. The content-should-be-SSOT remains a target; source→projection fidelity is a present invariant.

## 3. Decision Process — Rejected Alternatives

| Option | Rejection rationale |
|---|---|
| **Recency *boost* into routing priority (#13793)** | A flat, non-decaying label-score injected into priority overrides the emergent/decaying structural signal — synthetic scent on a trail nobody walked; doubly corrupt (synthetic AND permanent). The frontier fix (a) is the right lever. |
| **Fold Current-Focus visibility into routing** | Conflates intentional pointing with earned scent; the `state='OPEN'` guard + consumer-contract keep them distinct (b). |
| **Re-build the deterministic-reduce-only floor (#12423 shape)** | Already built-and-rejected (CHANGES_REQUESTED); #12439 governs the semantic-fidelity re-approach gated on real falsifiers (d). |
| **Assume consolidation health from a fresh handoff** | `forecast-fresh-but-graph-rotting` — the 316-undigested / `recentCycles=[]` state is invisible without consolidation-liveness observability. |

## 4. Consequences

### Positive
- **One north-star for the Brain** — the previously-scattered frictions (frontier-stale, candidate-pool dilution, undigested backlog, the boost temptation) are now one invariant family, so future changes have a single fidelity test.
- **Cloud-tenant correct-by-construction** — both invariants inherit ADR-0014's deployment classification (a cloud-disabled lane is never a candidate, never consolidated or forecast), so map-fidelity holds in a deployed tenant without a cloud-profile fork; consolidation-liveness makes a tenant's silent graph-rot observable.
- **Minimal blast radius** — each fix extends an existing primitive (the frontier query, the candidate-pool SQL, the handoff sections, the decay curve) per ADR-0019; no new subsystem.

### Negative / handoffs
- **Sub-decision (c) and (d)'s semantic upgrade are deferred/gated** — (c) on live measurement post-#13801, (d) on #12439's latency + fidelity falsifiers; the honest-consolidation-gap leaf ships independently.
- **The honest-gap leaf trades silence for noise** — a visible consolidation-gap in the handoff is louder than a silent drop, by design (the invariant prefers an honest gap to a green lie).

## 5. Anti-Patterns

1. **Synthetic scent** — any non-decaying boost/label injected into routing priority (re-creates #13793).
2. **Green-but-rotting** — reporting orchestrator/forecast health without consolidation-liveness; a fresh handoff over an undigested backlog.
3. **Folding visibility into routing** — a handoff visibility section becoming a routing input (breaks the consumer-contract).
4. **Re-deriving the rejected floor** — re-building #12423's deterministic-reduce-only shape instead of #12439's gated semantic upgrade.

## 6. Boundary — What this ADR does NOT decide

- **The over-band semantic-reduce design** — owned by Discussion #12439 (OQ1 latency + OQ6 fidelity).
- **The consolidation-stall execution fixes** — #13624 (lease-starve), #13551 (observability) are the execution/proof; this ADR is the vehicle.
- **The vector-sharing granularity change** — deferred to live measurement (sub-decision c).
- **The frontier-fetch scaling** — #13801's unbounded-metadata-fetch is a follow-up flagged at review.

## 7. Related

- **Graduated from:** Discussion #13802 (builds on #9887 stigmergy source).
- **Resolves:** #13805.
- **Implemented by:** #13801 (a, APPROVED), #12439 (d, gated), the honest-consolidation-gap leaf (d), #13624 (consolidation-liveness execution).
- **Depends on:** ADR-0009, ADR-0014, ADR-0019, ADR-0022; Brain pillar of ADR-0020.
- **Related:** #12065 (Orchestrator-as-SSOT epic), #12423 (built+rejected reduce-floor), #13551 (observability), #13793 (dropped boost — anti-anchor), ADR-0015/0017 (graph/chroma posture).
- **Substrate:** `ai/services/graph/*`, `ai/daemons/orchestrator/services/DreamService.mjs`, `ai/scripts/runners/runSandman.mjs`, `ai/agent/AgentOrchestrator.mjs`, `learn/agentos/DreamPipeline.md`.

## 8. Status / Lifecycle

- **Proposed** — graduated from Discussion #13802 with §6.2 family-keyed quorum (Claude/Opus signals + GPT-family `[GRADUATION_APPROVED]` on the final body) and a posted §5.2 Step-Back. Becomes **Accepted** on merge to `dev` with cross-family review per ADR-0005. Human merge gate.
- **Periodic re-review trigger:** any PR that changes the frontier query, the candidate-pool composition/filter, the decay curve, the handoff section/consumer contract, or the consolidation drain MUST cite this ADR.

## Signal Ledger (§6.6)

- `[AUTHOR_SIGNAL by @neo-opus-grace @ Discussion #13802 body-2026-06-21T19:24]` — Claude/Opus family.
- `[GRADUATION_APPROVED by @neo-gpt @ Discussion #13802 final 19:24 body]` — GPT family (non-author); "ADR can be filed."
- @neo-opus-vega (co-author, Claude/Opus) — spine + prior-art + consolidation-liveness V-B-A.

**Unresolved Dissent:** none. **Unresolved Liveness:** none (@neo-opus-vega back from compaction, co-driving). **Discussion Criteria Mapping:** OQ-a → AC frontier recency-sort (#13801); OQ-b → routing-XOR-visibility consumer-contract AC + state-gate; OQ-c → deferred-with-measurement; OQ-d → #12439 semantic-fidelity + honest-consolidation-gap leaf; consolidation-liveness → observability (#13551) + the 3 backlog-class dispositions.

Origin Session ID: `80932414-00dc-4d2e-96e6-d0bcf1529733` (Discussion #13802 graduation lineage)

Retrieval Hint: `query_raw_memories("DreamService organism map-fidelity consolidation-liveness ADR 0023 earned-and-forgetting synapse pheromone stigmergic frontier #13802 #13801 #12439")`
