---
id: 9872
title: 'Grid Multi-Body: 3-Tier Component Orchestration and Architecture Refactoring'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees: []
createdAt: '2026-04-10T18:19:24Z'
updatedAt: '2026-07-06T13:22:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9872'
author: tobiu
commentsCount: 2
parentIssue: 9486
subIssues:
  - '[x] 12757 grid.View owns body-scroll orchestration (syncBodies relocation from Container)'
  - '[x] 12800 Grid Multi-Body: dedicated grid.header.Wrapper orchestrator'
subIssuesCompleted: 2
subIssuesTotal: 2
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Grid Multi-Body: 3-Tier Component Orchestration and Architecture Refactoring

### The Problem: The \"God Object\" Pattern
Currently, `Neo.grid.Container` carries the burden of manually instantiating `headerStart`, `bodyStart`, and related split components. It forcibly injects them into the view hierarchy and manages low-level column iteration parameters. This violates the Single Responsibility Principle, creates immense VDOM diff penalties across unrelated domains (especially for Selection Models), and creates brittle `this.items` synchronization.

### The Solution: The 3-Tier Orchestration Architecture
To support the Multi-Body split cleanly and prepare the foundation for centralized Selection Models (unblocking #9492), the instantiation logic must be pushed downwards:

1. **`Neo.grid.Container` (Macro Routing):**
   - Stripped down into a pure macro layout coordinator.
   - Distributes columns parameters downwards but drops manual SubGrid instantiation from `createOrUpdateSubGrids()`.

2. **`Neo.grid.header.Wrapper` (New Orchestrator):**
   - A dedicated wrapper (upgraded from a generic `BaseContainer`) that is strictly responsible for managing `headerStart`, `headerToolbar`, and `headerEnd`.

3. **`Neo.grid.View` (The State Master):**
   - Transitioned into the master body orchestrator.
   - Strictly responsible for the creation, lifecycle, and row-synchronization (`syncBodies`) of `bodyStart`, `body`, and `bodyEnd`.

### Architectural Guarantee
This isolates all physical row logic perfectly beneath `grid.View`, enabling it to safely host the `SelectionModel` in the future without triggering header layout thrashing.

## Timeline

- 2026-04-10T18:19:26Z @tobiu added the `enhancement` label
- 2026-04-10T18:19:26Z @tobiu added the `ai` label
- 2026-04-10T18:19:26Z @tobiu added the `grid` label
- 2026-04-10T18:19:43Z @tobiu added parent issue #9486
- 2026-04-10T18:19:48Z @tobiu cross-referenced by #9868
### @neo-gpt - 2026-05-20T06:35:22Z

**Input from GPT-5 Codex Desktop (@neo-gpt):**

> ● [ticket-intake / readiness]
> 
> Verdict: `needs-narrowing`, not invalid.
> 
> I evaluated #9872 as a possible non-conflicting grid lane during the direct-DM-only AFK window. The live source still supports the premise:
> 
> - `src/grid/Container.mjs` still imports `GridBody` directly and holds `bodyStart`, `bodyEnd`, `headerStart`, `headerEnd`, and `headerWrapper` configs.
> - `createOrUpdateSubGrids()` still creates `headerStart`, `bodyStart`, `headerEnd`, and `bodyEnd`, then mutates both `headerWrapper.items` and `view.items`.
> - `syncBodies()` still lives on `GridContainer`, while `src/grid/View.mjs` remains a thin `hbox` layout container with `scrollTop` update metadata only.
> 
> So the architecture target is still relevant. The blocker is blast radius: this ticket describes at least three separable PR lanes:
> 
> 1. Header orchestration: introduce or upgrade the header wrapper so split header lifecycle moves out of `GridContainer`.
> 2. Body orchestration: move split body creation/lifecycle and `syncBodies()` ownership under `Neo.grid.View`.
> 3. Regression coverage: pin locked-column / multi-body row, header, selection, and scroll sync behavior before and after the ownership move.
> 
> Recommendation: split #9872 into sub-issues or explicitly mark the first narrow slice before implementation. A one-shot PR that moves all three layers at once would be high-risk for grid regressions and hard to review.
> 
> No assignment or branch taken.

- 2026-06-07T20:44:47Z @neo-gpt cross-referenced by #12695
- 2026-06-07T21:26:57Z @neo-opus-grace cross-referenced by #9492
- 2026-06-07T21:33:35Z @neo-opus-ada cross-referenced by PR #12701
- 2026-06-07T21:35:56Z @neo-gpt cross-referenced by PR #12697
- 2026-06-07T21:42:18Z @neo-gpt cross-referenced by #12696
- 2026-06-07T23:11:04Z @neo-opus-ada cross-referenced by #9491
- 2026-06-07T23:36:08Z @neo-gpt cross-referenced by #12698
- 2026-06-07T23:55:00Z @neo-opus-ada cross-referenced by #12707
- 2026-06-07T23:56:40Z @neo-opus-ada cross-referenced by PR #12708
- 2026-06-08T00:37:37Z @neo-gpt cross-referenced by PR #12714
- 2026-06-08T03:45:45Z @neo-gpt cross-referenced by #12729
- 2026-06-08T03:53:46Z @neo-gpt cross-referenced by PR #12730
- 2026-06-08T04:20:15Z @neo-gpt cross-referenced by #12733
- 2026-06-08T04:49:29Z @neo-gpt cross-referenced by #12734
- 2026-06-08T05:16:28Z @neo-gpt cross-referenced by PR #12736
### @neo-opus-grace - 2026-06-08T09:47:58Z

**Input from Claude Opus 4.8 (Claude Code):**

> ❋ ## 🌅 Session-sunset handover (solo-refresh) — multi-body SelectionModel
> 
> **State (committed, pushed, not-yet-PR'd):** branch `claude/9872-grid-body-orchestration`, commit `6ccc64a05`, rebased clean on dev (ahead 1), SM unit spec green (4 tests, `test/playwright/unit/selection/grid/BaseModel.spec.mjs`).
> 
> **Decisions locked this session:**
> - **ada cut-decision: GRACEFUL** — this slice preserves the Container `body`/`bodyStart`/`bodyEnd` accessors, so ada's #12708 SortZone `gridBody` getter (L61-66) stays intact → **no within-section column-DnD regression**. #9491 (cross-region DnD) fast-follows.
> - **FixA' confirmed NEEDED** — the split-body render in `onColumnsMutate` (Container.mjs ~1007) renders the split bodies on column-mutate/initial-setup; it's distinct from `onResize`'s render, which deliberately skips the initial event (`initialResizeEvent` guard). Not redundant.
> 
> **Pickup protocol (next session = me):**
> 1. Create a **leaf sub of epic #9492** for the selection mechanism (req 1+2: `BaseModel.updateRows` applies `.neo-selected` across all SubGrids + SubGrid-awareness).
> 2. Open the PR: `Resolves <new-leaf>` + `Refs #9872` + `Refs #9492` + `Refs #9486`. **Do NOT `Resolves #9492`** (it's an epic) **nor `#9872`** (this PR is slice-1, not its full delivery).
> 3. Evidence = L1 unit + integration code-trace of the wiring; **Post-Merge Validation = operator manually verifies the `bigData` multi-body grid UI** (the visual gate, operator-owned).
> 4. Cross-family gate = @neo-gpt or @neo-gemini-pro (ada is same-family Claude; touches the SM identity surface).
> 
> **Scope note:** this delivers the orchestration *slice* (`View.gridContainer` + `syncBodies`) + the SM. The full #9872 (Container stripped of SubGrid instantiation + new `grid.header.Wrapper` orchestrator + View owning body creation/lifecycle) is **post-v13 internal architecture** — the user-facing multi-body grid (selection + DnD) is the v13 target.
> 
> Owner: @neo-claude-opus. Origin Session ID: `1cf2ad9f-28af-4242-9069-fd14c04e1b62`.

- 2026-06-08T10:14:56Z @neo-opus-grace cross-referenced by PR #12754
- 2026-06-08T11:05:28Z @neo-opus-grace cross-referenced by #12757
- 2026-06-08T11:05:42Z @neo-opus-grace cross-referenced by #12758
- 2026-06-08T17:01:08Z @neo-opus-vega cross-referenced by PR #12777
- 2026-06-08T19:45:24Z @neo-opus-grace cross-referenced by PR #12784
- 2026-06-08T20:30:34Z @neo-gpt cross-referenced by #12787
- 2026-06-09T00:11:22Z @neo-opus-grace cross-referenced by #12800
- 2026-06-09T00:14:03Z @neo-opus-grace cross-referenced by PR #12801
- 2026-06-10T23:25:54Z @neo-fable cross-referenced by #12878
- 2026-06-21T10:56:01Z @neo-opus-vega cross-referenced by #13750
- 2026-06-23T03:43:57Z @neo-gpt cross-referenced by #9075

