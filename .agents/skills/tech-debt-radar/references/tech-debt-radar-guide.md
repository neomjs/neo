# Tech Debt Radar Guide

The radar is a **sensor, not a judge**: it measures ambient architectural debt against the repo's LIVING canon and routes findings to the lanes that own them. Its unduplicated substance is the sweep method below — the debt taxonomy itself is never stored here.

## 1. Execution Posture

Run this meta-analysis with frontier-tier capability — it synthesizes documentation, graph topology, episodic memory, and code layout at once. Tactical SML sub-agents halt and escalate. Capability class, not model names: pinned rosters decay by construction.

## 2. Pre-Flight: Derive the Canon (never copy it)

A copied canon decays by construction and eventually inverts — the radar then flags sanctioned shapes as debt. At sweep time, load the debt taxonomy FROM the living authorities:

1. `learn/benefits/ArchitectureOverview.md` — the structural baseline (Body/Brain topology).
2. `learn/agentos/decisions/` — the ADR index IS the pattern canon. Minimum reads: ADR 0019 (the `ai/`-config antipattern catalog) for config debt; ADR 0008 for skill-shape debt.
3. `npm run --silent ai:structure-map -- --files --loc` — the mechanical what-belongs-where and size truth.
4. The `pr-review` guide's anti-pattern tables and `AGENTS.md` §edge_case_triggers (the `apps/**` data-path/style gate, `core.Base` as the quality bar).

A conflict between this guide and those authorities is a bug in THIS guide — the authorities win. Freshness trigger: a pattern-canon ADR graduation invalidates this pointer list; revalidate it then.

## 3. The Multi-Vectored Sweep

### A. Ambient Artifact Traversal
Use `ask_knowledge_base` against the backlog (`resources/content/issues/`): abandoned concepts, incomplete migrations, trailing architectural directives.

### B. Episodic Memory Mining
Heavily use `query_raw_memories` and `query_summaries` for "abandoned loops" (an agent attempted X and rolled back; failed test hypotheses) — past thought-logs carry the *why* behind accrued debt.

### C. Codebase Vertical Slicing
Dive where A/B point. Classify anomalies strictly against the §2 catalogs, never against this guide's own taste — this guide's previous inline examples were canon-inverted by later ADRs, which is exactly why §2 derives instead of stating.

### D. Brain-Structural Debt (measure → report → route; never prescribe)
The Brain (`ai/`) now outweighs the Body in modules and LOC without the Body's structural discipline. Mechanical probes:

- structure-map LOC outliers benchmarked against the Body's ceiling;
- folder-shape consistency across `ai/daemons/*` (factored vs monolith vs ad-hoc flat);
- concept↔code-home coherence: every `learn/agentos/*.md` concept guide should map to a legible code home (calibration specimen: the Dream Pipeline guide vs its implementation smeared across 25+ files in five technical-layer buckets).

**Two-layer rule:** findings in this class are REPORTS routed to the #14304 / D#14302 canon lane — a canon-hole is itself a reportable finding. Prescribing target module shapes or file moves pre-SSOT is out of scope by #14304's own deferred gates.

## 4. Remediation Routing

Findings become tickets through `/ticket-create` — duplicate sweep, Fat Ticket, six-stage challenge chain; no bypass. Labels per the live taxonomy: `ai` + one primary (`bug`/`enhancement`) + `refactoring` as the secondary. Cite provenance (Memory Core sessions, historical PRs) so the fixing agent understands the exact architectural ROI. Brain-structural findings route per §3.D, never to unilateral restructure tickets.
