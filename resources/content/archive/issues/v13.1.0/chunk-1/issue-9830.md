---
id: 9830
title: Synchronize Multi-Body Selection State in GridContainer
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-04-09T17:06:21Z'
updatedAt: '2026-06-23T04:23:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9830'
author: tobiu
commentsCount: 4
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
closedAt: '2026-06-23T04:23:15Z'
---
# Synchronize Multi-Body Selection State in GridContainer

### Context
During the testing of the Grid Multi-Body architecture via Neural Link E2E capabilities, we discovered a core architectural synchronization failure in `Neo.selection.grid.RowModel`.

In a standard single-body Grid layout, the Selection Model successfully listens to DOM events such as `rowClick` bindings via `me.view.parent.on('rowClick', me.onRowClick, me)`, where `me.view.parent` typically represents the overarching orchestrator.

### The Problem
When the grid splits into multiple bodies (`bodyStart`, `bodyCenter`, `bodyEnd`), and we instantiate them using `Neo.grid.View` wrappers:
1. `GridBody.parent` explicitly resolves to `Neo.grid.View` (configured by `parentId: me.view.id`).
2. When a row is clicked inside `body`, the internal event fires `me.gridContainer.fire(eventName, ...)` directly natively targeting the Container. 
3. However, `RowModel` does not listen to `gridContainer`. It stays rigidly bound to its parent wrapper (`Neo.grid.View`). 
4. The `GridView` wrapper component does not natively trap or bubble the `rowClick` event. 

Because of this paradigm disconnect, the `RowModel` across sub-grids fails to detect row clicks, leaving the selection state (`selectedRows`) out of sync preventing rows from highlighting globally.

### Proposed Architecture Fix
1. Refactor `Neo.selection.grid.RowModel` to bind to `me.view.gridContainer || me.view.parent` so it natively captures the bubbling `rowClick` fired directly by `GridBody`.
2. Evaluate if state arrays such as `selectedRows` should be delegated upward to the `GridContainer` levels so all 3 instantiated RowModels reflect single state truth.

## Timeline

- 2026-04-09T17:06:22Z @tobiu added the `bug` label
- 2026-04-09T17:06:22Z @tobiu added the `ai` label
- 2026-04-09T17:06:23Z @tobiu added the `grid` label
- 2026-04-09T17:06:27Z @tobiu assigned to @tobiu
- 2026-04-09T17:06:35Z @tobiu referenced in commit `74a5abc` - "test: Sync E2E logic to Neural Link selection API #9830"
- 2026-04-09T17:08:42Z @tobiu referenced in commit `232a442` - "#9830 new testing file"
- 2026-06-07T21:26:57Z @neo-opus-grace cross-referenced by #9492
- 2026-06-08T10:12:06Z @neo-opus-grace unassigned from @tobiu
- 2026-06-08T10:12:09Z @neo-opus-grace assigned to @neo-opus-grace
### @neo-opus-grace - 2026-06-08T10:12:11Z

**`[lane-override]` reassignment audit-trail** (#11537 §AC8)

**Previous assignees:** `@tobiu`
**New assignees:** `@me`
**Reason:** Operator-directed (this session): PR branch claude/9872-grid-body-orchestration delivers the View-owned multi-body SelectionModel that synchronizes selection state across split bodies — the remaining (render / single-state-truth) half of this ticket. The event-detection half (RowModel binding to gridContainer) already landed on dev (RowModel.mjs:31). PR will carry Resolves #9830.

*Audit-trail per AGENTS.md §6.5 — `acknowledgedReassign` reason persistence. Graph-ingested via Retrospective daemon comment-scan path.*

- 2026-06-08T10:13:21Z @neo-opus-grace referenced in commit `ca7f580` - "feat(grid): View-owned multi-body SelectionModel + body orchestration (#9830)

One View-owned SelectionModel on the center grid.Body renders selection across all 1-3 bodies (bodyStart/body/bodyEnd): BaseModel.updateRows iterates the bodies off gridContainer and applies the extracted updateBodyRows per-body toggle, replacing the failed per-body peer models + getActivePeers fan-out that desynced. Adds the grid.View.selectionModel reference getter, the View.gridContainer back-reference, and View-owned syncBodies orchestration (Container delegates). Unit spec covers the multi-body iteration + the per-body toggle (4 tests green)."
- 2026-06-08T10:14:56Z @neo-opus-grace cross-referenced by PR #12754
- 2026-06-08T11:05:42Z @neo-opus-grace cross-referenced by #12758
- 2026-06-08T11:11:36Z @neo-opus-grace unassigned from @neo-opus-grace
- 2026-06-08T11:11:39Z @neo-opus-grace assigned to @tobiu
### @neo-opus-grace - 2026-06-08T11:11:41Z

**`[lane-override]` reassignment audit-trail** (#11537 §AC8)

**Previous assignees:** `@neo-claude-opus`
**New assignees:** `tobiu`
**Reason:** Reverting to @tobiu: PR #12754 was re-scoped to grid.View body-orchestration only (Resolves #12757), so it no longer targets this bug. V-B-A established multi-body cross-body selection already works on dev (GridSelectionMultiBody E2E green on dev, probe-confirmed) — this bug's symptom is not currently reproducible. The architecture hardening behind it (grid.View-owned single SelectionModel, eliminating the fragile per-body model construction) is now tracked in #12758 (Refs #9830). Leaving #9830 open for your disposition (close as works-on-dev, or keep as the tracking item for #12758).

*Audit-trail per AGENTS.md §6.5 — `acknowledgedReassign` reason persistence. Graph-ingested via Retrospective daemon comment-scan path.*

### @neo-opus-grace - 2026-06-08T11:20:00Z

**Input from Claude Opus 4.8 (Claude Code):**

> ❋ **Superseded by the #9492 `grid.View`-owned SM design-lock (comment 4644149298).** Per that graduated decision (converged @tobiu / @neo-opus-ada / @neo-gpt): *"#9830 (sync bug) — a single SM has nothing to 'sync across 3'; its event-seam finding is folded into the design above."*
> 
> V-B-A this session also confirmed the symptom is **not reproducible on dev** — `test/playwright/e2e/GridSelectionMultiBody.spec.mjs` cross-body row-selection is green on dev (the pre-design-lock peer fan-out happens to render it). The event-seam finding + the architecture hardening are tracked in **#12758** (the View-owned single-SM migration, post-v13).
> 
> Recommend closing as superseded. Reassigned to @tobiu for that disposition. 🖖

- 2026-06-11T01:21:10Z @neo-fable cross-referenced by #9486
- 2026-06-23T03:43:57Z @neo-gpt cross-referenced by #9075
### @neo-gpt - 2026-06-23T04:23:15Z

[ARCH_ALIGNMENT]

Closing this as completed by the successor lane rather than leaving the stale sync-bug shell open.

Fresh V-B-A:
- The issue's own June 8 audit trail already identified #12758 as the architecture-hardening successor and recommended closing #9830 as superseded once the View-owned SelectionModel lane carried the remaining work.
- #12758 (`grid.View-owned single SelectionModel — eliminate per-body model construction`) is now CLOSED.
- Current source has the intended event seam: `src/selection/grid/RowModel.mjs` listens on `me.view.gridContainer || me.view.parent` and no longer depends on the old wrapper-only row-click path described in this issue.
- Current source has the intended shared-selection substrate: `src/grid/View.mjs` owns/delegates the selection contract across active bodies, `src/selection/grid/BaseModel.mjs` spans bodyStart/body/bodyEnd, and `test/playwright/unit/grid/ViewOwnedSelectionModel.spec.mjs` pins the shared model behavior.
- The live E2E coverage named in the previous comments remains present as `test/playwright/e2e/GridSelectionMultiBody.spec.mjs`.

Decision: #9830's original bug framing has been folded into and delivered by #12758, so keeping this open would duplicate the closed successor's contract.


