---
id: 9456
title: 'Epic: Buffered Grid - High-Performance Locked Columns (`locked: ''start'' | ''end''`)'
state: CLOSED
labels:
  - epic
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T10:25:42Z'
updatedAt: '2026-03-24T14:46:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9456'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 9457 Grid: Implement Mathematical Column Layout Engine'
  - '[x] 9458 Grid: Create Main Thread Addon for Column Pinning (CSS Variables)'
  - '[x] 9459 Grid: Implement Reactive locked Config and Cell Pooling Bypass'
  - '[x] 9460 Grid: Column Drag & Drop Integration & State Transitions'
  - '[x] 9483 Grid: Implement Reactive locked Config and Run-Time Column Reordering'
  - '[x] 9484 Grid: Add Unit Tests for Locked Columns Feature'
  - '[x] 9485 Grid: Horizontal Scroll Performance & Jitter for Locked Columns'
subIssuesCompleted: 7
subIssuesTotal: 7
blockedBy: []
blocking: []
closedAt: '2026-03-24T14:46:12Z'
---
# Epic: Buffered Grid - High-Performance Locked Columns (`locked: 'start' | 'end'`)

The Grid component originally derived from the `Neo.table` package, which used `position: sticky` and a `dock` config for pinning columns. This legacy approach fundamentally fails in a virtualized Grid environment with Row and Cell Pooling. 

This Epic tracks the implementation of a modern, GPU-accelerated "locked" column architecture tailored for virtual scrolling, utilizing CSS Logical Properties (`locked: 'start' | 'end'`) to ensure future RTL (Right-to-Left) language compatibility.

**Key Architecture Decisions:**
1. **Mathematical Layout:** Refactor column logical positioning (X coordinates) to be driven purely by mathematical accumulation of column widths, rather than querying visual DOM states via `getDomRect`.
2. **Main Thread Pinning:** Use a Main Thread Addon (`GridColumnScrollPinning`) to synchronously translate scroll position into CSS variables (`--grid-locked-start-offset`), avoiding iteration over DOM nodes during active scrolling.
3. **Pooling Segregation:** Locked columns must bypass standard Cell Pooling ("Pass 1") and render as Permanent Cells ("Pass 2") to ensure they are never destroyed when scrolling out of the primary viewport.
4. **Drag & Drop Integration:** `SortZone` must support inferring `locked` states based on drop target neighbors, and runtime state changes must trigger a clean, optimized Grid VDOM refresh.

**Sub-Tasks:**
- [ ] Sub 1: Mathematical Column Layout Engine (Refactor `Toolbar.mjs` and `Container.mjs`)
- [ ] Sub 2: The Main Thread Pinning Addon (`GridColumnScrollPinning`)
- [ ] Sub 3: Reactive `locked_` Config and Cell Pooling Bypass (`grid.column.Base`, `Row.mjs`, SCSS)
- [ ] Sub 4: Drag & Drop Integration & State Transitions (`SortZone.mjs`)

## Timeline

- 2026-03-13T10:25:53Z @tobiu added the `epic` label
- 2026-03-13T10:25:53Z @tobiu added the `grid` label
- 2026-03-13T10:25:53Z @tobiu added the `ai` label
- 2026-03-13T10:25:59Z @tobiu assigned to @tobiu
- 2026-03-13T10:26:33Z @tobiu cross-referenced by #9457
- 2026-03-13T10:26:50Z @tobiu added sub-issue #9457
- 2026-03-13T10:27:10Z @tobiu cross-referenced by #9458
- 2026-03-13T10:27:19Z @tobiu added sub-issue #9458
- 2026-03-13T10:27:59Z @tobiu cross-referenced by #9459
- 2026-03-13T10:28:06Z @tobiu added sub-issue #9459
- 2026-03-13T10:28:32Z @tobiu cross-referenced by #9460
- 2026-03-13T10:28:40Z @tobiu added sub-issue #9460
- 2026-03-16T11:10:29Z @tobiu cross-referenced by #9483
- 2026-03-16T11:10:52Z @tobiu added sub-issue #9483
### @tobiu - 2026-03-16T12:25:56Z

**Input from Gemini 3.1 Pro:**

> ✦ **Epic Status Update: Architectural Foundation Complete**
> 
> All core architectural sub-tasks for the high-performance Locked Columns feature have been successfully implemented and pushed. 
> 
> **What we accomplished:**
> 1. **Mathematical Layout Engine (#9457):** The Grid now inherently sorts the `columns` array (`start` -> `unlocked` -> `end`) before VDOM generation. The `passSizeToBody` engine was refactored to calculate logical X coordinates purely mathematically for fixed-width grids, gracefully falling back to DOM measurements only when dynamic sizing (`flex`) is used.
> 2. **Synchronous Pinning Addon (#9458):** We created the `GridColumnScrollPinning` Main Thread addon. It maps horizontal scroll events synchronously to `--grid-locked-start-offset` and `--grid-locked-end-offset` CSS variables. The registration is completely dynamic, evaluating `hasLockedColumns` to ensure zero overhead for standard grids.
> 3. **Cell Pooling Bypass & SCSS (#9459):** `grid/Row.mjs` was split into strict passes. Pass 1 skips locked columns. Pass 2 forces locked columns to render as "Permanent Cells", preventing them from being unmounted/recycled when scrolled out of view. The `transform: translateX(...)` offloads the visual shift to the compositor, avoiding layer explosions.
> 4. **Drag & Drop Integration (#9460):** The `SortZone` interface now infers locked states based on drop boundaries. We built a robust pipeline (`grid.Container#onColumnLockChange`) that fully handles sorting, DOM syncing, and heavy layout recalculations seamlessly across the framework without duplicating logic.
> 
> **Next Steps (Upcoming Phase):**
> - **Unit Testing:** Add tests to verify the pipeline logic and array sorting.
> - **Example Integrations:** Integrate locked columns into existing robust examples.
> - **New Feature Demo:** Create a dedicated Locked Columns example app.
> - **E2E Automation:** Validate the visual compositor transforms and drag-and-drop boundary inference via Playwright.

- 2026-03-16T12:48:41Z @tobiu cross-referenced by #9484
- 2026-03-16T12:49:46Z @tobiu added sub-issue #9484
- 2026-03-16T15:09:29Z @tobiu added sub-issue #9485
- 2026-03-24T14:46:12Z @tobiu closed this issue

