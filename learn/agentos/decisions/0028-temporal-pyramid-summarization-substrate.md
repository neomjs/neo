# ADR 0028: Temporal-Pyramid Summarization Substrate

> Architectural Decision Record for Epic #12679 — the bird's-eye **history + current-state** navigation layer over PRs, session memories, and Memory Core weighted summaries. Records the Cycle-3 cross-family convergence from Discussion #11376 as durable authority: a **durable/dynamic tier split** (L1/L2 precomputed facts, L3–L5 synthesized on demand), one `temporal-summary` collection inside the unified Chroma store, deterministic velocity metrics with named per-field sources, and per-agent partitioning. Implementation subs of #12679 are merge-blocked until this ADR is `Accepted`.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-07-02 (transitions to Accepted on approved, green PR merge at the human merge gate, per ADR 0005 §2.3) |
| **Author** | @neo-fable-clio (Clio, Claude Fable 5), grounded in live V-B-A at `dev` (epic + Discussion re-read; `learn/agentos/decisions/` number sweep; PR `#12676` merge-state check; ADR 0017/0023/0024 reconciliation reads) |
| **ADR classification** | `ADR_REQUIRED` — durable storage/schema/lifecycle decisions that multiple future implementation tickets consume; without one authority, future V-B-A requires archaeology across a Discussion, an epic, and session memories (the drift this ADR ends had already propagated: on 2026-07-02 `ask_knowledge_base` synthesized the substrate's ADR as "ADR 0020" — an unrelated accepted record) |
| **Resolves** | #14427 — *"Author ADR 0028: temporal-pyramid summarization substrate"* (foundational sub of Epic #12679) |
| **Graduated from** | Discussion #11376 (Cycle-3 convergence; quorum: GPT `[GRADUATION_APPROVED]` + Claude `[AUTHOR_SIGNAL]`; Gemini `operator_benched` → Unresolved Liveness carried in #12679 with a named `revalidationTrigger`) |
| **Supersedes** | The `#11376` "ADR 0008" placeholder and the epic's interim "next-free `ADR 0020`" pointer — both stale number references, never accepted records (`0008` = skill-anatomy ADR; `0020` = agent-harness ADR). Number pinned at foundational-sub filing per the epic's own re-verify instruction (`0020`–`0027` occupied, verified 2026-07-02) |
| **Composes (aligned-with)** | ADR 0017 (unified Chroma store — §2.3 reconciliation), ADR 0022 (heavy-maintenance scheduling fairness — the durable-tier aggregation lane), ADR 0023 (consolidation governance), ADR 0024 (Native Edge Graph model — §2.7 node-type obligation) |
| **Depends-on** | ADR 0005 (ADR-at-graduation workflow; status lifecycle + merge-gate semantics) |
| **Anti-anchor for** | Durable LLM-compression cascades above the daily tier; collection-per-level store sprawl; widening the `SemanticGraphExtractor` prompt for summary labels; prose as a metric source; carrying stale ADR numbers forward |

---

## 1. Context

Neo has no temporal-navigation primitive for the bird's-eye **history** and **current-state** dimensions (#11375 §3 Option D). Answering *"what happened this week / month / quarter?"* today requires either a cross-session full scan + LLM synthesis at query time (high latency and cost) or the per-session summary chain (no cross-window aggregation). Memory Core weighted summaries are per-session, not temporal-window aggregations.

Three empirical anchors ground the decision:

1. **The origin failure (May 2026):** a *"12 months to ANI-crossover"* estimate shipped without V-B-A'ing project velocity; the operator's correction (*"we merge 150+ PRs a week"*) exposed an order-of-magnitude-wrong baseline. A cheap bird's-eye velocity surface would have made that failure impossible-by-construction. (Inherited from parent #11375.)
2. **The failure the layer prevents fired while the layer sat unbuilt (June 2026):** the operator's design-first directive drifted unflagged across ~1005 merged June PRs; no bird's-eye layer existed to surface the drift. The assessed remediation is a ~500-ticket design-tier retrofit (2026-07-02 operator assessment).
3. **Convergent re-derivation (June 2026):** `#13441`'s freshness/authority ledger re-derived `#11375`'s `DerivedSignalContract` weeks later in different vocabulary, and `#14422`'s measurement consumers overlap this epic's current-state + velocity scope. The absence of the recorded strategic layer caused partial re-derivation of the strategic layer — simultaneously the strongest ROI evidence for building it and the exact re-derivation class the substrate makes computable.

The authority itself decayed while unfiled: the graduated Discussion carried an "ADR 0008" placeholder (number already occupied), the epic corrected it to "next-free 0020" (occupied three weeks later), and by 2026-07-02 the Knowledge Base was synthesizing the wrong ADR as this substrate's authority. This record ends that class: the number is pinned at filing, and the decisions live here rather than in re-derivable prose.

## 2. Decision

A hierarchical, navigable temporal-summary substrate over PRs + session memories + Memory Core weighted summaries, with a **durable/dynamic split**:

### 2.1 Durable tiers — L1 (session) / L2 (daily): precomputed facts

Append-only historical aggregation with high query frequency; velocity-metric caching requires durable storage here. The aggregation lane reuses the **landed** heavy-maintenance pattern from PR `#12676` (merged 2026-06-07): `MaintenanceBackpressureService` lane + supervised-child scheduled task + most-recent-first bounded batches, scheduled under the ADR 0022 fairness model.

### 2.2 Dynamic tiers — L3–L5 (weekly / monthly / quarterly): synthesized on demand

Computed over L2 aggregates + `query_recent_turns` (chronological) + `query_raw_memories` (semantic) at query time. **No durable LLM-compression cascade exists above L2**: the "photocopy-of-a-photocopy" degradation can never occur, and the tier×partition cron explosion is eliminated. (This is the Gemini-family Cycle-1/2 objection incorporated as the Cycle-3 shape — reconciled-by-incorporation, with the retroactive-review residual preserved in #12679 §Unresolved Liveness.)

### 2.3 Storage — one collection, inside the unified store (ADR 0017 reconciliation)

One `temporal-summary` Chroma collection carrying `{level, partition, windowStart, windowEnd, version}` metadata — **not** collection-per-level. Per-level SQLite graph labels (`SUMMARY_DAILY`, `SUMMARY_WEEKLY`, …) are written by a **deterministic aggregation lane**, never by widening the `SemanticGraphExtractor` Tri-Vector extraction prompt.

**Reconciliation clause — within-posture, no amendment:** ADR 0017 decides the *store* shape (one flat `unified` persist store; one daemon) and names **collections + metadata as the sanctioned separation mechanism**. Adding the `temporal-summary` collection to the unified store is therefore an ordinary application of 0017, not a divergence: no new persist directory, no second daemon, no directory-level artifact. Implementation obligation: the new collection joins the Memory-Core-realm maintenance groups (defrag targets, backup/restore scope) when created — it is irreplaceable derived-plus-source state on the MC side of 0017's KB-as-cache / MC-as-store recovery model.

### 2.4 Velocity metrics — deterministic structured fields (Discussion OQ8)

Durable tiers carry structured fields, each with a **named source substrate**; prose is never the source of truth:

| Field | Source substrate (impl subs bind the exact query) |
|---|---|
| `mergedPrs` | GitHub PR sync (`resources/content/pulls/**` / graph PR nodes) |
| `devCommits` | git history (`dev` first-parent log window) |
| `sessionsPerAgent` | Memory Core session nodes (per-agent partition keys) |
| `highImpactSessions` | Memory Core session impact metadata (`impact >= 90`) |
| `adrsLanded` | `learn/agentos/decisions/` + `AdrIngestor` ADR nodes |
| `sandboxesGraduated` | Discussion graduation markers (GitHub Discussions sync) |

### 2.5 Fidelity — citation discipline (Discussion OQ5)

Higher tiers cite sessions with `impact >= 90` and accepted ADRs **directly**; PR fidelity flows through a named source (accepted-ADR links, epic labels, high-impact review metadata). **No invented universal PR impact score.**

### 2.6 Partitioning

Per-agent tracks plus one unified track with attribution — per-agent future-self continuity is a first-class consumer (Discussion OQ-resolved; unified-only was rejected).

### 2.7 Graph-model obligation (ADR 0024 re-review trigger)

The implementation sub that introduces `SUMMARY_*` node types/labels **must update ADR 0024 §2.2 (node-type table) and cite ADR 0024 in the same PR**, per 0024's own periodic re-review trigger. This ADR pre-declares that obligation so it cannot be discovered at PR-review time.

## 3. Rejected Alternatives

Preserved from `#11376` §3 + the three review cycles:

| Option | Rejection rationale |
|---|---|
| **Status quo** (no temporal-navigation primitive) | The three §1 anchors are the cost, already paid twice. |
| **Unified-only partition** (no per-agent tracks) | Loses per-agent future-self continuity. |
| **Daily/weekly-only** (no higher tiers) | Caps below the bird's-eye threshold the strategic-awareness parent requires. |
| **Durable L3–L5 compression cascade** | Photocopy-of-a-photocopy degradation (Gemini Cycle-1 catch) + tier×partition cron explosion. |
| **Collection-per-level** | Store sprawl; one collection + `level` metadata serves every query shape (GPT OQ6). |
| **Widening the `SemanticGraphExtractor` prompt with summary labels** | Summary labels are deterministic aggregation output, not LLM extraction (GPT Cycle-1). |
| **Carrying a stale ADR number forward** | Third occurrence terminated here: `0008` → `0020` → `0028`, pinned at filing with recorded verification. |

## 4. Consequences

### Positive

- *"What happened this week / month / quarter?"* becomes a cheap, navigable query instead of a full-scan synthesis; the §1 origin-failure class (velocity claims without V-B-A) becomes impossible-by-construction for any agent that queries before asserting.
- One authority record ends the re-derivation cycle (§1 anchor 3) and the KB misdirection (the drift anchor in #12679's comment thread).
- Durable tiers are bounded, append-only, and deterministic; dynamic tiers add zero storage and zero scheduled load.

### Negative / handoffs

- Durable-tier growth needs a retention/versioning policy — owned by the L1/L2 implementation sub, within the `version` metadata field this ADR fixes.
- Dynamic L3–L5 pays query-time synthesis cost — accepted deliberately (~33–34 LLM calls/week corrected cost math from the Cycle-3 convergence; re-verify at implementation).
- The aggregation lane adds a scheduled heavy-maintenance consumer — scheduled under ADR 0022 fairness; the lane must not starve REM/defrag siblings.

## 5. Merge gate

Implementation subs of #12679 are **merge-blocked until this ADR is `Accepted`** (per `#11376` §6 and ADR 0005 §2.3). Epics/tickets may be filed and shaped before acceptance; code-bearing PRs may not merge before it.

## 6. Boundary — what this ADR does NOT decide

- Exact aggregation queries, schemas-in-full, retention policy, and scheduling cadence — implementation subs, under §2's constraints.
- Consumer surfaces (dashboards, MCP tools, cockpit panes) and trust-budget questions — parent #11375's open questions, explicitly out of this epic's scope.
- The future-planning dimension (*"which path could Neo evolve along?"*) — stays in #11375.
- The authority-metadata vocabulary unification across `DerivedSignalContract` / freshness-ledger / tier-lattice — adjacent work owned by the `#14422` divergence window; this ADR is input evidence, not its resolution. **Consume-direction pre-declared** (symmetric to §2.7): the temporal tiers are also a future *consumer* of that work — L1/L2 aggregate sessions that will carry provenance/fidelity tiers post-`#14422`/`#14418` AC-3, and a summary synthesized over weak-digest sessions must propagate a fidelity signal — so the implementing subs adopt the `#14422` shared tier contract for source-provenance representation once it lands, rather than discovering the obligation at impl-PR time.

## 7. Related

- **Parent epic:** #12679 · **Resolves:** #14427 · **Source Discussion:** `#11376` · **Strategic parent:** #11375
- **Evidence-adjacent:** `#13441` (convergent re-derivation), `#14422` (measurement-consumer overlap), PR `#12676` (landed backpressure pattern)
- **Composes:** ADR 0005 / 0017 / 0022 / 0023 / 0024
- **Substrate (V-B-A source):** `ai/services/memory-core/` (session/summary surfaces), `ai/services/graph/SemanticGraphExtractor.mjs` (the prompt this ADR forbids widening), `MaintenanceBackpressureService` + supervised scheduled tasks (the §2.1 lane pattern), `learn/agentos/decisions/` (number-sweep provenance)

## 8. Status / Lifecycle

- **Proposed** — becomes **Accepted** on approved, green PR merge at the human merge gate (cross-family review required; fable author → non-fable reviewer).
- **Re-review triggers:** any PR that (a) changes the durable/dynamic tier boundary, (b) introduces durable compression above L2, (c) adds a temporal collection or moves temporal data outside the unified store, (d) introduces `SUMMARY_*` node types (must also update ADR 0024 §2.2), or (e) alters the §2.4 metric-source table MUST cite this ADR and update the affected section.
- **Liveness carry:** #12679 §Unresolved Liveness (Gemini `operator_benched`, reconciled-by-incorporation) applies to this record; its `revalidationTrigger` (Gemini-reactivation sweep) covers the §2.2 shape that incorporates the Gemini-family objection.

Origin Session ID: 2251c81c-1446-4723-86b3-479322bbcc95

Retrieval Hint: `query_raw_memories("temporal pyramid ADR 0028 durable dynamic tier split velocity fields unified store reconciliation")`
