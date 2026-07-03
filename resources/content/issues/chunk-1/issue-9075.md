---
id: 9075
title: 'refactor: Optimize Grid Selection Models Architecture'
state: OPEN
labels:
  - no auto close
  - ai
  - refactoring
  - core
  - needs-re-triage
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2026-02-09T12:18:06Z'
updatedAt: '2026-06-23T03:43:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9075'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# refactor: Optimize Grid Selection Models Architecture

**Context:**
Following the implementation of `internalId` (#9070) and subsequent fixes for selection logic, we identified significant technical debt in the `src/selection/grid` namespace. The current architecture suffers from deep inheritance chains, duplicated logic, and brittle type-checking heuristics.

**Problem:**
1.  **Deep Inheritance:** The chain `CellColumnRowModel -> CellRowModel -> CellModel -> BaseModel` forces hybrid models to override logic from ancestors that doesn't fit (e.g., `CellRowModel` having to manually sync row selection because `CellModel` ignores it).
2.  **Logic Duplication:** `CellColumnModel` and `CellColumnRowModel` duplicate the "Conditional Flush" logic (checking `isEqual` on `selectedColumns`) to ensure visual updates.
3.  **Brittle `updateRows`:** `BaseModel.updateRows` uses string parsing (`includes('__')`) to distinguish between Cell IDs and Record IDs. This is fragile and should be polymorphic.
4.  **Column Selection Redundancy:** Multiple models manage column selection using copied logic.

**Objectives:**
1.  **Introduce Mixins:** Refactor `RowSelection` and `ColumnSelection` into reusable Mixins. Use composition instead of deep inheritance for hybrid models (e.g., `CellModel` + `RowSelectionMixin`).
2.  **Polymorphic Updates:** Refactor `updateRows` to delegate to a polymorphic `updateItem(item)` method on the subclass, eliminating the need for `isCell` checks in the base class.
3.  **Centralize Flush Logic:** Move the `selectedColumns` change detection and flush logic into a shared location (Mixin or Base).
4.  **Normalize IDs:** Ensure consistent handling of `internalId` vs `recordId` across all models.

**Scope:**
- `src/selection/grid/BaseModel.mjs`
- `src/selection/grid/RowModel.mjs`
- `src/selection/grid/CellModel.mjs`
- `src/selection/grid/ColumnModel.mjs`
- `src/selection/grid/CellRowModel.mjs`
- `src/selection/grid/CellColumnModel.mjs`
- `src/selection/grid/CellColumnRowModel.mjs`


## Timeline

- 2026-02-09T12:18:07Z @tobiu added the `ai` label
- 2026-02-09T12:18:07Z @tobiu added the `refactoring` label
- 2026-02-09T12:18:07Z @tobiu added the `core` label
- 2026-02-09T12:25:41Z @tobiu added the `no auto close` label
- 2026-06-07T21:26:57Z @neo-opus-grace cross-referenced by #9492
- 2026-06-07T21:42:16Z @neo-gpt cross-referenced by PR #12697
- 2026-06-07T21:42:18Z @neo-gpt cross-referenced by #12696
- 2026-06-08T11:19:57Z @neo-opus-grace cross-referenced by #12758
- 2026-06-23T03:43:38Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T03:43:38Z @neo-gpt added the `needs-design` label
- 2026-06-23T03:43:38Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-06-23T03:43:56Z

[ARCH_ALIGNMENT]

Ticket triage + intake classification on 2026-06-23: **real debt, but not code-ready as written**. Preserved open, excluded from branch pickup.

Triage note: per `ticket-triage`, I did **not** add a primary label because the retrospective challenge does not fully pass at the prescription/readiness layer. The premise still has current-source evidence, but the February prescription predates the June View-owned SelectionModel work and needs a refreshed design ledger before implementation.

Evidence checked:
- Live issue state: #9075 was created/updated on 2026-02-09, has no comments, no assignee, and carries `no auto close`.
- Stale-band: `.github/workflows/close-inactive-issues.yml` sets stale at 90 days and close 14 days later. At 2026-06-23T03:40:20Z, #9075 is **post-stale-with-exemption** by updatedAt (>104 days) and `no auto close` is present; this requires a full successor/source sweep, not blind pickup.
- Successor sweep: PR #12784 merged on 2026-06-09 and resolves #12758, replacing per-body cloned SelectionModels with one `grid.View`-owned model across bodies. That is a newer architectural constraint touching `src/grid/Body.mjs`, `src/grid/Container.mjs`, `src/grid/View.mjs`, and `src/selection/grid/*`.
- Related live tickets still exist: #9492 (open epic, assigned to @tobiu) and #9830 (open) cover multi-body selection behavior; #9872 is already `not-code-ready` + `needs-design` for the broader 3-tier body orchestration.
- Current source still confirms remaining #9075 debt:
  - `src/selection/grid/BaseModel.mjs` still distinguishes logical cell IDs with `item.toString().includes('__')`.
  - `CellColumnModel` and `CellColumnRowModel` still duplicate selected-column change/flush logic.
  - `CellColumnRowModel -> CellRowModel -> CellModel -> BaseModel` remains the deep inheritance path.
  - `getActivePeers()` and multiple fan-out callers still exist, but under the shared View-owned model these are now stale/no-op shaped and need deliberate cleanup rather than a blind mixin rewrite.

Required re-entry design before implementation:

| Surface | Decision needed |
|---|---|
| Selection model composition | Whether mixins are still the target after #12758, or whether the smaller first slice is dead-peer cleanup + polymorphic `updateBodyRows` only. |
| `BaseModel.updateRows()` / `updateBodyRows()` | Replacement contract for logical-cell vs row record handling without delimiter parsing. |
| Column selection behavior | Shared helper/mixin/base path for selected-column flush semantics, with multi-body View-owned rendering preserved. |
| Public/config compatibility | Guarantee existing `ntype` values and `body.selectionModel` swaps still work after any composition change. |
| Related topology | Relationship to #9492, #9830, and #9872: which ticket owns behavior, which owns cleanup, and which is superseded. |
| Evidence | Focused unit coverage around View-owned model sharing, dynamic model swaps, row/cell selection, column selection, and no stale peer fan-out. |

Applied labels: `not-code-ready` + `needs-design` + `needs-re-triage`.


