# Epic Creation Workflow

Authoritative protocol for authoring an **Epic** body — the creation-side dual of `ticket-create`, and the entry partner of `epic-review` (pre-work review) + `epic-resolution` (closeout). An Epic is a parent issue (label `epic`) that coordinates multiple sub-tickets toward one shared outcome.

## The Core Rule: an Epic body describes the PROBLEM, not the plan

An Epic body is **problem-scope + intended-solution** — the durable "why + what-shape." It is NOT a container for the sub-decomposition or the acceptance criteria.

- **ACs live in the SUB tickets, never the Epic body.** Each sub owns its own acceptance criteria + Contract Ledger (per `ticket-create`).
- **Subs are LINKED, not listed.** Attach each sub to the Epic via `update_issue_relationship` (parent-child). The live sub-set is the linked relationship graph, queried on demand — NOT prose in the body.
- **The Epic body MUST NOT hardcode a sub-list or sub-content.** A body that enumerates "Sub 1 / Sub 2 / …" or bakes their ACs goes stale the moment a sub is added, split, renamed, or dropped → the body contradicts the relationship graph → **FAIL**. Subs are added incrementally at any time; the body must stay valid across that churn.

**Empirical anti-pattern (why this skill exists):** epics #12440 + #12442 baked full AC lists + a sub-decomposition into the body, then created the subs separately — the body now duplicates (and will out-stale) the linked subs. `epic-review`/`epic-resolution` (the entry/exit duals) existed, but no creation-side discipline did.

## What an Epic body SHOULD contain

Epic creation uses the same importance order as ticket and PR review: the problem/premise and intended placement dominate the verdict. Sub AC detail belongs in leaf tickets; an Epic with exhaustive sub mechanics but a weak premise or wrong owning substrate is not ready.

1. **Problem scope** — the friction / antipattern-cluster / goal, with empirical anchors. State why this needs an Epic (multi-sub coordination) rather than a single ticket.
2. **Intended solution shape** — the architectural direction (the "what-shape"), NOT the per-sub task breakdown. Enough that a reader knows the convergent shape the subs will serve.
3. **(If Discussion-graduated) the §6.6 Signal Ledger** — the graduation consensus record (family-keyed quorum, unresolved dissent / liveness, criteria-mapping) per `ideation-sandbox-workflow.md §6`. This is the one structured matrix that belongs in an Epic body, because it records the graduation event, not the sub-plan.
4. **Out of scope** — sibling efforts + explicitly-deferred directions.
5. **Avoided traps / rejected shapes** — the divergence preserved from the source Discussion (if any).

## What an Epic body MUST NOT contain

- A `## Acceptance Criteria` checklist — those are per-sub.
- A `## Sub-tickets` registry that enumerates subs with content. The body MAY reference a sub by `#N` in prose where load-bearing, but must not be the canonical sub registry (that is the `update_issue_relationship` graph).
- **Pseudo-subs** — placeholder sub descriptions the body pretends to own before the real subs exist.

## Sub-decomposition: the leaf-sub close-target contract

Each sub the decomposition creates MUST be a **leaf that a single PR can FULLY deliver and `Resolves`** — a hard contract, because the `lint-pr-body` CI requires every PR body to carry a `Resolves #N` where N is a fully-delivered leaf.

- **Each sub = one-PR-deliverable leaf.** Never bundle separable deliverables (e.g. "declarative reshape" + "lint guard", or "fix" + "observability") into one sub. A bundled sub cannot be cleanly `Resolves`'d by either PR → it forces mid-review leaf-splitting churn.
- **The Epic is the umbrella, never a PR close-target.** It carries the `epic` label, is `Refs`'d (never `Resolves`/`Closes`) by its subs' PRs, and must NEVER be a PR close-target — the `pr-review` close-target audit forbids closing an `epic`-labeled issue (an epic auto-closed while subs are still open is the canonical close-target sabotage). The Epic closes via `epic-resolution` once its leaf subs are done.
- **Multi-cause symptom tickets** → one leaf per cause; each PR `Resolves` its own leaf and `Refs` the symptom.

## Lifecycle position

| Skill | Phase | Owns |
|---|---|---|
| **`goal-scoping`** | Front-end (upstream) | Scope a GOAL → the set of owned LANES this skill then authors (one epic per lane); peers self-select their lane |
| **`epic-create`** (here) | Creation | Problem-scope + intended-solution body; `epic` label; title hygiene |
| `epic-review` | Pre-work entry | Roadmap fit, approach elegance, source-Discussion mapping, sub-structure coherence; seeds the Stage 3.1 closeout matrix |
| `epic-resolution` | Closeout exit | Reconciles delivered subs against the parent ACs (which live in the subs) |

## Procedure

1. **Confirm Epic-shape.** The work needs ≥2 coordinated subs. A single bounded artifact (≈1 PR's worth) is a standalone ticket (`ticket-create`), not an Epic.
2. **Run the Agent OS structure map.** Before authoring the body, run `npm run --silent ai:structure-map -- --files --loc`; use it for Agent OS / architecture placement claims or record N/A.
3. **Graduation gate (if from a Discussion).** High-blast Epics require the §6.2 family-keyed quorum + the §5.1 divergence matrix in the source Discussion before filing (per `ideation-sandbox-workflow.md` + `ideation-sandbox/audits/double-diamond-divergence-guard.md`). Carry the `Signal Ledger` / dissent / liveness / criteria-mapping sections into the body.
4. **Author the body** = problem-scope + intended-solution (+ ledger if graduated). NO ACs, NO sub-list.
5. **Label `epic`** + apply title hygiene (per `ticket-create`).
6. **Create subs separately** (via `ticket-create` — each with its own ACs + Contract Ledger) and **link each via `update_issue_relationship`** (parent = the Epic). Add subs incrementally as decomposition clarifies; that governs Epic life. Goal-scoping graduation is stricter: full v1 leaves are filed/native-linked, while the Epic body stays sub-list-free.
7. **Verify** (pre-flight, before `create_issue`):
   - [ ] Body contains **no** `## Acceptance Criteria` block.
   - [ ] Body contains **no** hardcoded sub-registry (subs discoverable via parent-child relationship instead).
   - [ ] Body answers "why an Epic (multi-sub coordination), not a single ticket?".
   - [ ] Structure-map gate executed or N/A recorded.
   - [ ] If Discussion-graduated: `Signal Ledger` present + quorum met.
   - [ ] Each planned sub is a one-PR-deliverable **leaf** (no bundled separable deliverables); the Epic is `Refs`'d by subs, never a PR close-target.
