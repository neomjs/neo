---
id: 9611
title: 'Grid Multi-Body: Native Vertical Scrollbar & Alignment Spacer'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-31T14:03:19Z'
updatedAt: '2026-06-23T04:01:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9611'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
closedAt: '2026-06-23T04:01:48Z'
---
# Grid Multi-Body: Native Vertical Scrollbar & Alignment Spacer

### Problem
In the Grid Multi-Body architecture, the `bodyWrapper` natively handles vertical scrolling (`overflow-y: scroll`). However, this introduced a 15px layout shift where the grid bodies become horizontally misaligned with the `headerWrapper`, which lacks a vertical scrollbar.

### Solution
1. Remove `scrollbar-width: none` from `bodyWrapper` to allow the native vertical scrollbar to be visible at the far right edge of the grid.
2. Dynamically measure the browser's native scrollbar width.
3. Inject a CSS spacer (e.g. `padding-right`) into the `headerWrapper` whenever the vertical scrollbar is active to restore perfect horizontal alignment between the headers and the cells.

This resolves the missing vertical scrollbar thumb while preserving zero-jitter native vertical compositing.

### Task List
- Modify `.neo-grid-body-wrapper` CSS.
- Calculate native scrollbar width in JS.
- Update `Header.mjs` or `Container.mjs` to inject the compensation spacer.

## Timeline

- 2026-03-31T14:03:20Z @tobiu added the `enhancement` label
- 2026-03-31T14:03:21Z @tobiu added the `ai` label
- 2026-03-31T14:03:21Z @tobiu added the `grid` label
- 2026-03-31T14:07:03Z @tobiu added parent issue #9486
- 2026-03-31T14:07:05Z @tobiu assigned to @tobiu
- 2026-06-09T00:11:22Z @neo-opus-grace cross-referenced by #12800
### @neo-gpt - 2026-06-23T04:01:40Z

[COMPLETED_BY_SUCCESSOR] Maintenance verification on 2026-06-23: this ticket is superseded by the later Grid Multi-Body scrollbar sequence and current source architecture.

Why this should not remain an implementation lane:

- #9612 closed the first scrollbar-refactoring/restoration pass and records horizontal scrollbar decoupling plus vertical restoration.
- #9625 closed the visual-delegation step for native vertical scrollbar UX in multi-body grids.
- #9635 is now closed for the dual-pipeline vertical scrollbar architecture.
- Current `src/grid/VerticalScrollbar.mjs` explicitly documents the active design: `neo-grid-view` keeps `overflow-y: scroll` for compositor-driven wheel/trackpad scrolling, but the visible/grabbable thumb is a dedicated container-level `VerticalScrollbar` proxy. It explicitly warns not to merge this back into localized native `overflow-y` styling.
- Current `src/grid/View.mjs` still carries `baseCls: ['neo-grid-view', 'neo-hide-scrollbar']`, and `resources/scss/src/grid/View.scss` hides the native view scrollbar. Current `resources/scss/src/grid/VerticalScrollbar.scss` owns the visible scrollbar width/positioning instead.
- Current tests cover the successor surface: `GridThumbDrag*.spec.mjs` targets vertical thumb behavior and `HorizontalScrollbar.spec.mjs` / `GridColumnOverdragScroll.spec.mjs` cover the decoupled horizontal scrollbar model.

The #9611 prescription — make the body wrapper’s native scrollbar visible and inject a header spacer — is no longer the desired architecture. Closing this as completed/superseded-by-successor work rather than letting it invite a regression PR.

- 2026-06-23T04:01:48Z @neo-gpt closed this issue
- 2026-06-23T04:04:25Z @neo-gpt cross-referenced by #9637

