# ADR 0031: Target-Architecture Composition — the Seam Table + Trajectory Layer

> The **composition record for the whole organism**: how the 30 slice-ADRs compose into the
> canonical Two-Hemisphere scaffold (Body `/src/` ↔ Brain `/ai/`, joined by the Neural Link — per
> ADR 0018 OD-3), which decision owns which **seam**, and the **trajectory invariants** that must
> structurally hold as the organism accumulates toward ANI on the gated-RSI path. This ADR does for
> the organism what ADR 0024 does for the Native Edge Graph (its own words: "the composition that
> the scattered slice-ADRs each serve a fragment of") — one level up. It is a **citing index plus
> invariants**: it re-decides nothing, supersedes nothing, and stays current **by construction**
> via an id-based CI guard (§4) — a new ADR cannot merge without taking its seam-table row.

**Status:** Proposed — 2026-07-03 (until PR merge, per ADR 0005 lifecycle)
**Graduated from:** Discussion #13846 (convergence pass + cross-family `[GRADUATION_APPROVED]`)
**Resolves:** #14525 · **Identity authority:** ADR 0018 (untouched; cited)
**Sibling leaf:** #14526 — the governed `AGENTS.md` two-hemisphere alignment (never bundled here)

## §1 The Organism (by citation, not re-decision)

The canonical top-level scaffold is **Two Hemispheres** (ADR 0018 OD-3, operator-decided
2026-05-30): the **Body** — the multi-threaded application engine under `/src/` — and the
**Brain** — the Agent OS under `/ai/` — joined by the **Neural Link** (the JSON-RPC WebSocket
possession seam). Four-pillar language (Swarm / Evolution) is Brain-internal elaboration, never the
top-level frame. The always-loaded `AGENTS.md` carried two stale four-pillar anchors; #14526 is
their governed repair (ADR 0018 + `neo-identity-update` + `turn-memory-pre-flight` apply).

Beyond the two hemispheres, decisions also attach to two cross-cutting planes: the
**Institution plane** (coordination, identity, process — how the swarm works the substrate) and
the **Deployment plane** (how the organism runs and heals in local + cloud topologies). The seam
table names one owning surface per decision.

## §2 The Seam Table

One row per present ADR (§4 enforces this mechanically). *Seam* = the boundary or contract the
decision owns; *Parent* = the composition record that already aggregates it, where one exists.

| ADR | Surface | Owned seam | Parent |
|---|---|---|---|
| 0001 | Brain / graph | GraphService cache coherence across processes | 0024 |
| 0002 | Institution | Wake-substrate schema alignment (MCP + A2A standards) | — |
| 0003 | Brain / graph | Chroma topology: one unified daemon | 0024 (amended by 0017) |
| 0004 | Institution | On-disk GitHub-content shape (ordinal-100 chunking) | — |
| 0005 | Institution | ADR-at-graduation lifecycle for ideation discussions | — |
| 0006 | Brain / graph | ADRs as graph-queryable entities (`ADR` label) | 0024 |
| 0007 | Institution | Loaded-substrate compaction taxonomy (3-axis slot rule) | — |
| 0008 | Institution | Skill anatomy + authoring contract (`SKILL.md`) | — |
| 0009 | Brain / orchestration | Cross-daemon heavy-maintenance lease inheritance | — |
| 0010 | Institution | Lane-intent pre-V-B-A coordination primitive | — |
| 0011 | Institution | Substrate numbering (`§<ref>`) reference identity | — |
| 0012 | Institution | Model-stats: capability tracking + sunset/promotion triggers | — |
| 0013 | Brain / KB | KB ingestion-telemetry persistence schema | — |
| 0014 | Deployment | Cloud topology + scheduler task taxonomy (deployment axis) | — |
| 0015 | Brain / graph | Graph store backend posture (SQLite WAL first) | 0024 |
| 0016 | Institution | AI-script CLI parser convention (Commander-first) | — |
| 0017 | Brain / graph | Chroma single flat unified store + dev/prod parity | 0024 |
| 0018 | Cross-hemisphere | **Identity source-of-truth model** (facts / framing / actions; OD-3 scaffold) | — |
| 0019 | Brain / config | AiConfig as the reactive Provider SSOT (the read-gate) | — |
| 0020 | Body ↔ Brain seam | The Agent Harness concept (Electron shell, fleet + human personas) | — |
| 0021 | Neural Link seam | Extended-NL multi-writer write enforcement (subtree locks) | — |
| 0022 | Brain / orchestration | Heavy-maintenance scheduling fairness (priority axis, extends 0014) | — |
| 0023 | Brain / graph | Dream governance: map-fidelity + consolidation-liveness invariants | pairs 0024 |
| 0024 | Brain / graph | **The Native Edge Graph composition** (model: nodes, edges, storage, provenance) | — |
| 0025 | Deployment | Immune system, detect half: container-health diagnostics daemon | — |
| 0026 | Deployment | Immune system, act half: lifecycle recovery actuator (privilege tiers) | pairs 0025 |
| 0027 | Deployment | Immune system, data half: Memory-Core data-recovery actuator | pairs 0025/0026 |
| 0028 | Brain / graph | Temporal-pyramid summarization substrate (history navigation) | 0024 |
| 0029 | Body ↔ Brain seam | Harness docking design (multi-window layout, perspectives, cross-window drag) | extends 0020 |
| 0030 | Brain / orchestration | Work-graph stall inference (`STALL_*` findings) | — |
| 0031 | Organism | **This record**: composition seams + trajectory invariants + the staleness guard | — |
| 0032 | Body ↔ Brain seam | Institution-Cockpit render-model (object-permanent selves + COP; identity anti-lock-in contract) | extends 0020 |
| 0033 | Brain / graph | Direction contract: deterministic evolution-direction keys + per-direction `{v,s,r}` velocity + the fail-open additive boundary | amends 0024/0028 |
| 0034 | Body ↔ Brain seam | Electron shell architecture (process model, SharedWorker window topology, security posture, distribution) | extends 0020 |

## §3 Trajectory Invariants

The shipped arc — v13 (the cross-family institution) → v13.1 (the self-healing immune system) →
v13.2 (the harness/embodiment scope, #14038) → v14 (the institution cockpit, #13444) — is
accumulation on the **gated-RSI path** (README, Discussion #10137). These invariants must hold at
every step; each names its owning decision. A proposal violating one is challenging that owner,
and must say so explicitly (`Decision Record impact: challenges ADR NNNN`).

1. **The memory write never fails** for anchoring/enrichment reasons — durability outranks
   decoration (owner: the #12972 hardening arc; consumed by 0024-family writers).
2. **Render ≠ memory** — rendered surfaces (handoffs, cockpit views, dashboards) are projections
   of substrate, never substrate themselves (owners: 0020/0029 on the Body side; the concept-slice
   contract on the Brain side).
3. **Detect is separate from act** — a health/integrity signal is an input to a diagnosis; a
   diagnosis is an input to a bounded actuator; no signal triggers a heal directly
   (owners: 0025 / 0026 / 0027).
4. **Persistence is chosen** — agents decide what they save; memory capture is never automated
   (operator covenant, 2026-07-02; the telepathy-aware curation contract around `add_memory`).
5. **Structural weight is deposited, never assigned** — graph importance is earned by real work
   and evaporates without it; fixes route to the scent, not the trail (owner: 0023).
6. **Coordination stays flat-peer** — primitives (0010 lane-intent, wake substrate 0002, stall
   findings 0030) inform self-selection; none may become assignment machinery.
7. **Identity is descriptive, never prescriptive** — rendered selves are records, not
   instructions (owner: 0018 for identity-of-Neo; the Institution-Cockpit render-model ADR, in
   authoring from #14445, extends this to identity-of-agents).
8. **One vocabulary per contract** — shared annotation/measurement vocabularies (trust tiers,
   the four-axis lattice, seam names) have exactly one importable authority; re-derived local
   copies are defects (empirical anchors: the 2026-07-02 review pair on #14520/#14522).

## §4 The Staleness Contract (the guard that makes this ADR trustworthy)

A composition layer above an evolving corpus drifts unless kept current **by construction**:

- **The guard:** `ai/scripts/lint/lint-adr-seam-table.mjs` derives the present ADR ids from
  `learn/agentos/decisions/[0-9][0-9][0-9][0-9]-*.md` and fails CI unless the §2 table contains
  **exactly one row per present id** (both directions: no missing rows, no ghost rows).
- **The authoring rule:** a new ADR merges **with** its seam-table row in the same diff — the
  guard makes forgetting impossible, not discouraged. Deleting/renaming an ADR likewise updates
  the table in the same diff.
- Id-based, never count-based (graduation constraint): the guard reads what exists; it assumes no
  slot numbering.

## §5 Boundaries

- **Citing index semantics:** this record re-decides nothing. Each seam's substance lives in its
  owning ADR; disagreements with a row's *content* are challenges to the owner, not to this index.
- **Identity stays in 0018** — including the OD-3 scaffold this record cites.
- **Subsystem composition stays with subsystem composers** (0024 for the graph; 0025/0026/0027 as
  the immune-system triple) — this record composes the composers.
- **No guide pair** initially: a maintained guide without a mechanical freshness link is a second
  drift surface (graduation record, Option E falsifier). Revisit only on onboarding evidence.

## Decision Record impact

none re-decided; aligned-with ADR 0018 / 0024; conditions the authoring practice of every future
ADR via §4 (a process obligation, not an authority change).

Related: Discussion #13846 (graduation source) · #14525 (authoring leaf) · #14526 (the AGENTS.md
alignment sibling) · ADR 0018 · ADR 0024

Origin Session ID: 8cf234b7-e698-47ca-99e2-bf865196b6aa
