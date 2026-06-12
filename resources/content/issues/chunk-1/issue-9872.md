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
updatedAt: '2026-05-20T06:35:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9872'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
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


