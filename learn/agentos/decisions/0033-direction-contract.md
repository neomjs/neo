# ADR 0033: The Direction Contract — deterministic evolution-direction keys, per-direction velocity fields, and the fail-open additive boundary

> Architectural Decision Record for Epic #14565 (Direction-weighted Golden Path) — the schema/authority floor every implementation leaf consumes. Records the 2026-07-04 graduation of Discussion #14453 (author fold of the GPT §5.2 STEP_BACK asks A–E) as durable authority: **deterministic direction identity**, **append-only mapping versioning**, the **`directionBreakdown` extension of ADR 0028's durable tiers**, the **conservation invariant with a first-class UNATTRIBUTED pool**, and the **fail-open additive boundary** under which direction data may annotate but never gate the computed route. Implementation subs of #14565 (#14567–#14570) are merge-blocked until this ADR is `Accepted`.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-07-04 (transitions to Accepted on approved, green PR merge at the human merge gate, per ADR 0005 §2.3) |
| **Author** | @neo-fable (Mnemosyne, Claude Fable 5), grounded in live V-B-A at `dev` (Discussion #14453 body @ 00:30:30Z fold anchor; `learn/agentos/decisions/` number sweep — 0031 latest on dev, 0032 reserved on-record for the #14445 cockpit render-model ADR, this record takes 0033; ADR 0023/0024/0028 reconciliation reads) |
| **ADR classification** | `ADR_REQUIRED` — the GPT graduation gate (ask D, DC…17528043): *"any SUMMARY_* direction field must cite ADR-0028 and any new graph node/edge class must cite/update ADR-0024"*; without one authority, four implementation leaves re-derive the key/versioning/filter semantics independently and drift |
| **Resolves** | #14566 — *"Direction-contract Decision Record (ADR-0028 amendment path)"* (leaf 1 of Epic #14565) |
| **Graduated from** | Discussion #14453 (quorum: GPT `[GRADUATION_APPROVED]` post-fold + Claude `[AUTHOR_SIGNAL]` + co-lead verification; Gemini `operator_benched` → Unresolved Liveness carried in #14565 with the standard `revalidationTrigger`) |
| **Amends** | ADR 0028 (§2.1/§2.4: `directionBreakdown` + `windowSemantics.filterSets` on the durable tiers — same single deterministic lane, no new writer); ADR 0024 (node/edge registry: `EVOLUTION_GOAL` node class + direction-mapping edges, protected-set disposition below) |
| **Composes (aligned-with)** | ADR 0023 (consolidation governance — earned-scent/`notAuthority` boundaries), the #14442 business-engine schema (`BUSINESS_GOAL` → generalized, not forked), #14447 stall classes (the `s_D` input), #13751 hook-consumer contract (the fail-open floor this record hardens) |
| **Depends-on** | ADR 0005 (status lifecycle + merge-gate semantics) |
| **Anti-anchor for** | LLM labels or mutable cluster names as direction identity; aggregate-then-attribute composition; multiplicative direction gating; retroactive mapping rewrites; a second aggregation pipeline beside ADR 0028 §2.3's single lane; board columns as durable substrate |

---

## 1. Context

The Computed Golden Path ranks items by `2×semantic + 1×structural` against the last-2-session frontier — momentum-following at item granularity. Discussion #14453 established (live-verified 2026-07-02) that direction-weighting already exists *blind*: the label filter excludes 42.2% of open items as a routing boundary nobody declared as strategy; frontier-proximity is a momentum prior; the structural cold-start makes genuinely new directions unrecommendable by construction; declared intent (release train, `BUSINESS_GOAL` nodes, epics/milestones) is consumed by no ranking mechanism.

Two empirical anchors make the failure class concrete:

1. **June 2026 (the born-labeled fixture):** *"design and UX got fully lost; board almost complete = misleading, not even PoC state; team was hunting scraps without realising it"* (operator post-mortem, 2026-07-04). A declared direction that no attributed motion serves — the `INTENT_STARVED` state this substrate computes — fired for a month with no instrument to see it.
2. **Post-v13.1 (the live symptom):** the Golden Path rendered `Selected routed nodes: 0` immediately after release (GPT V-B-A, 2026-07-04) — computed routing contradicting release focus, with no direction layer to explain or annotate the emptiness.

The contract below is the floor for fixing both without creating the counter-failure: a direction layer strong enough to steer would also be strong enough to corrupt ranking silently. Every clause therefore pairs a capability with its boundary.

## 2. Decision

### 2.1 Deterministic direction identity (the key contract)

A direction is identified by a **deterministic key**, exactly one of:

- a **declared anchor id** — an `EVOLUTION_GOAL` node id (§2.5), or
- an **emergent cluster id, version-qualified** — `cluster-id + mappingVersion`.

**LLM labels and mutable cluster names are never identity.** Attribution facts are `{directionKey, mappingVersion}` pairs with **append-only history**: a re-clustering lands as `mappingVersion` N+1 writing NEW attribution facts; it never rewrites prior facts. Historical records remain exact records of *what that mapping version attributed*. (Rejects the retroactive-membership-drift class — an aggregate re-attributed under today's mapping yielding a different number with no recorded reason is the #14430-unfalsifiable class, refused by rule.)

### 2.2 Composition: attribute-then-aggregate on the ADR 0028 single lane (amendment)

Per-direction velocity is computed by attributing each motion event FIRST, then aggregating per direction at window build — the substrate owner's disposition (#14453 OQ2, `RESOLVED_TO_AC`). Mechanically this AMENDS ADR 0028 §2.4: L1/L2 durable records gain

- **`directionBreakdown`** — a map `{"<directionKey>@<mappingVersion>": share}` on the existing record (one record per window; if the map exceeds ~20% of record bytes at realistic direction-counts, it moves to a side-table keyed by record id — the semantics survive, the layout doesn't), and
- **`windowSemantics.filterSets`** — the declared motion-class filter sets (§2.4).

**No sibling pipeline.** The ADR 0028 §2.3 single deterministic aggregation lane is the only writer; a second direction lane would double-schedule under §2.1 backpressure and add a second writer to a deliberately single-writer design. `{v_D, s_D, r_D}` components aggregate FROM breakdowns upward: velocity, stall-mass (keyed from #14447 stall classes through the same breakdown), regression (cross-window attribution flow). **Stalls never subtract into velocity** — "fast-but-bleeding" (high `v_D`, high `s_D`) must stay visible; collapsing to a scalar is rejected (consumer-rejected by #13751, which requires separable `s_D` to name stalled lanes).

### 2.3 The conservation invariant and the UNATTRIBUTED pool

Per window, per declared filter set:

```
Σ_D v_D + v_UNATTRIBUTED = v_total
```

machine-checked at L1 build — a failed identity is a build defect, never noise. **UNATTRIBUTED is a first-class pool, not residue:** it is the innovation-or-drift signal (human judges), and it is the fail-open floor — attribution absence degrades to *unweighted-but-visible*, never to fail-closed, never to a faked split. Below any coverage floor the correct behavior is to render the pool, not split it.

### 2.4 Filter-set declaration and falsifier symmetry

Motion inputs to any `{v, s, r}` component are **class-filtered by construction**, with the filter set declared in `windowSemantics` — never implicit (chore-class pollution measurably drifts across windows: 37% vs 24% in the May/June fixtures, a hidden multiplier no consumer can correct post-hoc). **Falsifier symmetry:** the shipped `falsifyingQuery` for any direction metric carries the SAME declared filter set and the SAME `mappingVersion` pin as the measurement — one number, one filter, both sides. **Cross-window `{v_D, s_D, r_D}` comparisons are defined ONLY within identical filter sets**; a comparison across differing sets is a type error, not a subtle bias.

### 2.5 `EVOLUTION_GOAL` and the mapping edges (ADR 0024 amendment)

- **`EVOLUTION_GOAL`** is a new node class **generalizing** #14442's `BUSINESS_GOAL` (shared schema family, per the #14453/#14548 OQ5 cross-verdict: composable siblings, never merged). Declared anchors are small-N capped; release-train goals seed free; **intent weights are operator-owned (Tier-4 set), never computed**. Goal ids mint through `canonicalizeConceptId` (the concept-spine SSOT) — the 2,705-alias-cluster hazard makes canonical ids a correctness gate, not polish.
- **Direction-mapping edges** (motion-fact → direction) and goal-lattice edges are registered in the ADR 0024 vocabulary. **Protected-set disposition:** attribution facts and their edges JOIN `PROTECTED_EDGE_TYPES` (exempt from Hebbian decay) — a velocity number built on silently-decaying edges rots invisibly (the #14422 durability lesson, applied forward). Any class not protected must ship its re-derivation path in the same PR.
- New node classes ship with the **#14426 post-sync integrity canary** (silent node-loss is a demonstrated failure class).

### 2.6 The fail-open additive boundary (HARD, load-bearing for every consumer)

Direction alignment enters ranking **additively as annotation/weight and can NEVER gate or zero the base computed route**:

- alignment = 0 zeroes the direction term; the base ranking survives untouched (the #13751 hook-consumer floor);
- the live `Selected routed nodes: 0` class is preserved — the direction layer annotates an empty route surface honestly; it never manufactures routes and never suppresses them;
- **durable facts land in graph/issue/summary substrate — never project-board columns** (boards are observability, not substrate);
- all rendered direction artifacts inherit the #11375 `DerivedSignalContract` / `notAuthority: true` — confidence-scored navigation aids, never hidden authority.

### 2.7 Validation and render gates (sequencing authority)

The epic's staging is normative: **attribution (#14567) → velocity (#14568) → hindcast validation (#14569) → render (#14570)**. No rendered forecast exists at any horizon without demonstrated hindcast skill at that horizon (error bars from measured miss-rate). The **June-2026 fixture is a gate, never a tuning set** (a run over June that misses the starved design/UX direction fails, full stop); **May 2026 is the divergence holdout**, scored once. Every rendered direction metric carries its `falsifyingQuery` (#14430 discipline).

### 2.8 Consumer map (the OQ6 boundary record, both directions)

| Boundary | Produces → this substrate | Consumes ← this substrate | Constraint imposed |
|---|---|---|---|
| #13751 hook | — | additive direction-annotated ranking, separable `{v,s,r}` | fail-open additive-never-gating (§2.6); advisory DATA only |
| #14442/#14430 business engine | `BUSINESS_GOAL` schema + `falsifyingQuery` discipline | direction-alignment annotations (dashboard render) | first declared-direction client; shared schema, separate epic |
| #14447 proprioception | stall classes → `s_D` | — (v1) | separable stall-mass, never negative velocity |
| #14306 arch-debt | debt findings → direction-cost | — | ladder input, not v1 |
| ADR 0028 / #14433–#14435 pyramid | window mechanics, SUMMARY_* fields | `directionKey` slot + `directionBreakdown` sub-aggregates | single-lane single-writer (§2.2) |
| #11375 parent | `DerivedSignalContract` / `notAuthority` vocabulary | — | contracts flow down; approvals do NOT |

**Carry rule:** any boundary above not landed at a leaf's merge is carried as a named section of that leaf's PR — never silently dropped.

## 3. Out of scope

The OQ7 goal-lattice horizon (ROI-weighted goal values, `REQUIRES`/`ENABLES`/`THREATENS` edges, path-prefix scoring, ETA propagation, scenario compare) — the follow-on ladder; each rung graduates separately behind its own falsifier, and its edge vocabulary gets its own ADR 0024 registration when it earns one. The #14548 convergence-ledger epic (#14581) — composable sibling on the shared `EVOLUTION_GOAL` schema, its own validation clock. Any promise/ROI scalar (uniform promise in v1 by construction).

## 4. Consequences

**Positive:** four implementation leaves consume one authority instead of re-deriving key/versioning/filter semantics; the June-class planning failure becomes machine-detectable (`INTENT_STARVED`) with a bounded, falsifiable instrument; the ranking system gains a strategy signal that structurally cannot corrupt it (§2.6); ADR 0028's substrate gains its first strategy-level consumer without a new pipeline.

**Negative / accepted costs:** append-only mapping history grows storage monotonically (bounded by version half-life; the §2.2 cardinality probe guards record bloat); protected-edge exemption grows the non-decaying edge set (accepted: correctness over decay hygiene for measurement substrate); one more ADR in the 0024/0028 composition web (accepted: the alternative was drift across four leaves).

**Revalidation trigger (Tier-2):** on Gemini-family reactivation, re-poll against this record + Epic #14565 (§6.5 retroactive review).
