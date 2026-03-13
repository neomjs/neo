---
id: 9456
title: 'Epic: Buffered Grid - High-Performance Locked Columns (`locked: ''start'' | ''end''`)'
state: OPEN
labels:
  - epic
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T10:25:42Z'
updatedAt: '2026-03-13T10:25:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9456'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[ ] 9457 Grid: Implement Mathematical Column Layout Engine'
  - '[ ] 9458 Grid: Create Main Thread Addon for Column Pinning (CSS Variables)'
  - '[ ] 9459 Grid: Implement Reactive locked Config and Cell Pooling Bypass'
  - '[ ] 9460 Grid: Column Drag & Drop Integration & State Transitions'
subIssuesCompleted: 0
subIssuesTotal: 4
blockedBy: []
blocking: []
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

