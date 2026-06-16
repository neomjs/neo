# Update Roadmap Workflow

The repeatable **post-release planning beat**: a shipped release should *trigger* the next roadmap, not leave it to chance. This skill runs that beat — celebrate the win, then scope the next release as **cornerstones + rationale** with an explicit deferred set, into a GitHub milestone whose cornerstone epics each carry a named steward.

It is the **release-altitude analog of `epic-create`**: where `epic-create` says *an epic body names the problem-shape and subs are LINKED, not listed*, this skill says *a roadmap names the release thesis + cornerstones, and the epics are LINKED to the milestone, not prose-listed*. Sibling to **#10321** (the release-*cut* skill: release-notes + publish mechanics), which stays parked until a steady-state release is actually cut.

## The Core Rule: a roadmap is cornerstones + rationale, NOT an exhaustive item-list

A roadmap names the **load-bearing direction** of the next release — the few cornerstone epics plus the "why this release" thesis — and the **explicitly deferred** set. The full work-set is the **milestone's linked items, queried on demand** — never prose-enumerated in the roadmap. A hardcoded item-list stales the moment an epic is added, split, or dropped → the roadmap contradicts the milestone → **FAIL** (exactly as a hardcoded sub-list fails an epic body in `epic-create`).

Clarity comes as much from the visible **out** (deferred) as the **in** (cornerstones). A roadmap with no deferred set leaves every un-named epic silently-abstract — the "abstract goals to chase" friction this skill exists to kill.

**Replace, don't append (the temporal axis).** The roadmap holds the CURRENT next-release ONLY — each run **REPLACES** the prior next-scope; it never accretes a `## Shipped: vN` layer per release. Prior-release history + the framework vision are relocated, not inlined (see MUST NOT).

## The beat — celebrate, then plan (in order)

1. **Celebrate first.** Name the shipped release and its headline (PRs merged, issues closed, the thesis it delivered). The win + reward-continuity are an institution-health goal, not ceremony — skipping it is a rejected shape. A short A2A broadcast / release-note acknowledgement suffices — never a permanent `ROADMAP.md` section.
2. **Assess what landed** (Verify-Before-Assert). Confirm the shipped version, that its milestone closed, and which epics resolved. Read the truth — release tags (`13.0.0`, *not* `v13.0.0` — empirical substrate), milestone state, `package.json` — never assume.
3. **Open / identify the next release milestone.** The milestone is the durable container that cornerstone epics get assigned to. (Cite the milestone tool / `gh` behavior; do not re-document its mechanics here.)
4. **Scope the cornerstones + rationale.** Name the few load-bearing epics and the one-paragraph "why this release" thesis. Prefer epics that already exist; file new ones via `epic-create` only when a cornerstone has no home.
5. **Make the deferred set explicit.** List the notable epics held OUT, so the boundary is visible. Deferred ≠ rejected — it is "not this release."
6. **Assign + steward.** Assign each cornerstone epic to the milestone and ensure each has **one named steward** (see *Steward ownership model*). Stewards **self-select** — surface the option-space, never pre-assign peer lanes (flat-peer; `lead-role` §2).
7. **Drive graduating Discussions to quorum FIRST.** If the scope folds in Discussion graduations, each must reach **family-keyed cross-family quorum** before it graduates into a cornerstone epic (per `ideation-sandbox-workflow.md §6`; carried into the epic body as the Signal Ledger per `epic-create`). **Never rubber-stamp a graduation to fit a roadmap** — "must be included" means *drive it to convergence*, not force it past the consensus-mandate.

## Steward ownership model (the working model)

Each cornerstone epic has exactly **one named steward** — accountable that the epic's **main goals are reached and the epic is resolved + closed** (via `epic-resolution`), NOT that they personally land every sub. Any peer claims subs; the steward owns the *outcome*.

- Declared at the epic via `epic-create` (a steward line in the body) and driven to closure via `epic-resolution`. This skill does not re-implement that model — it **invokes** it per cornerstone.
- Stewardship is **self-selected**, not assigned. The roadmap surfaces the unstewarded cornerstones as an option-space; peers claim them by affinity, capacity, and judgment.

## What a roadmap SHOULD / MUST NOT contain

**SHOULD:** the release thesis (rationale); the cornerstone epics (linked to the milestone); the explicit deferred set; the steward map; a budget/cadence note (steady-state ≈ 100–150 merged PRs — sequence any over-budget stretch as a capstone, keep the deferred set firm).

**MUST NOT:** an exhaustive prose item-list (stales → FAIL); a scope with no visible deferred set; pre-assigned peer steward lanes; a graduation rubber-stamped to fit the scope; a framework-vision restatement (→ `.github/VISION.md`); prior-release shipped-history (→ `resources/content/release-notes/`).

## Avoided traps / rejected shapes

- **Roadmap = exhaustive list** → rejected; cornerstones + rationale, full set = the milestone's linked items, queried.
- **Skip the celebration** → rejected; the win + reward-continuity matter (institution health).
- **No explicit deferred set** → rejected; clarity is a visible *out*, not just *in*.
- **Rubber-stamp Discussion graduations to hit scope** → rejected; drive each to cross-family quorum first (consensus-mandate).
- **Over-scope past the cadence** → sequence the stretch cornerstone as a capstone; hold the deferred set firm. Codify the steady-state cadence, not an exceptional bridge-release (v13's 1,200+ PR / 1,600+ issue anomaly is NOT the template).
- **Lead pre-assigns steward lanes** → rejected; flat-peer self-select (the orchestrator-worker drift `lead-role` guards against).

## Worked example — v13.1 (this skill's first dogfood; illustrative snapshot, NOT the live registry)

The inaugural run scoped **v13.1 → milestone #8**:
- **Thesis:** the Agent Harness becomes real, end-to-end ("the institution gets a face").
- **Cornerstone categories** (linked to the milestone, not an exhaustive list): harness core (`#13012` umbrella · `#13015` Fleet Manager · `#13377` Electron shell) · the 3 latest-Discussion graduation targets (`#13378`→`#13376`, `#13374`→a new freshness epic, `#13370`→`#13158`) — each driven to cross-family quorum FIRST (step 7), not pre-counted as graduated · the H2 conversational-creation wedge (`#13349`/`#13056`) · a 4-friction stability floor (`#12740` local-model, `#12065` golden-path/REM, `#13287` codex-wake, `#10291` Agent-OS cloud).
- **Deferred (firm OUT):** `#9486` Grid Multi-Body · `#10030` Concept Ontology · `#12986` VDom delta-stream · `#12679` Temporal-Pyramid · `#12456` AiConfig-SSOT cleanup.
- **Stewards (self-selected):** Vega = ROADMAP slice + ownership model + milestone; Ada = this skill + Fleet Manager; Grace = NL-control + golden-path; Euclid = freshness + codex-wake.
- The live v13.1 scope is **milestone #8's linked items**, not this paragraph.

## Lifecycle position

| Skill | Phase | Owns |
|---|---|---|
| **`update-roadmap`** (here) | Post-ship | Celebrate + scope the next release milestone (cornerstones, rationale, deferred, stewards) |
| **#10321** release-cut (parked until cut) | Pre-cut | Release-notes assembly + publish / version mechanics |
| `epic-create` / `epic-resolution` | Per-epic | Declare a cornerstone's steward / drive it to closure |

## Verify (before publishing the roadmap)

- [ ] The release was **celebrated** (win acknowledged).
- [ ] Scope is **cornerstones + a one-paragraph thesis**, not an exhaustive prose list.
- [ ] An **explicit deferred set** is named.
- [ ] Each cornerstone epic is **assigned to the milestone** and has **one self-selected steward**.
- [ ] Any folded Discussion graduation **met cross-family quorum** (no rubber-stamp).
- [ ] Over-budget stretch (vs the ≈ 100–150 PR cadence) is sequenced as a **capstone**, deferred set held firm.
- [ ] No prior-release history or vision restatement remains **inline** (relocated, not duplicated).
