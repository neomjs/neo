---
id: 8959
title: 'Feat: Implement hideMode for Grid Columns to support OffscreenCanvas buffering'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-03T12:11:03Z'
updatedAt: '2026-02-03T12:32:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8959'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T12:32:51Z'
---
# Feat: Implement hideMode for Grid Columns to support OffscreenCanvas buffering

We need to implement a buffering strategy for Grid Columns to support cases like `OffscreenCanvas` where removing the DOM node destroys the worker connection context.

**Proposed Changes:**
1.  **`src/grid/column/Base.mjs`**:
    - Add `hideMode` config (String, default: `'removeDom'`).
    - Valid values: `'removeDom'`, `'visibility'` (uses `visibility: hidden`), `'display'` (uses `display: none`).
    - Note: `visibility` is preferred for Canvas to maintain layout geometry.

2.  **`src/grid/Body.mjs`**:
    - Update rendering logic (`createRow`) to ensure columns with `hideMode !== 'removeDom'` are always rendered in the VDOM, regardless of whether they are within the `mountedColumns` window.
    - If such a column is outside the mounted range, it will be rendered with the appropriate hiding style.

**Benefits:**
- Solves the "Zombie Canvas" issue where horizontally scrolling destroys `OffscreenCanvas` connections.
- Improves scrolling performance for heavy column components by avoiding reconstruction.


## Timeline

- 2026-02-03T12:11:04Z @tobiu added the `enhancement` label
- 2026-02-03T12:11:04Z @tobiu added the `ai` label
- 2026-02-03T12:32:09Z @tobiu referenced in commit `e15bb38` - "Feat: Implement hideMode for Grid Columns to support OffscreenCanvas buffering (#8959)"
- 2026-02-03T12:32:20Z @tobiu added parent issue #8930
### @tobiu - 2026-02-03T12:32:30Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the new `hideMode` configuration for Grid Columns and enabled it by default for `Sparkline` columns.
> 
> **Changes Implemented:**
> 
> 1.  **`src/grid/column/Base.mjs`**:
>     -   Added `hideMode` config (values: `'removeDom'`, `'visibility'`, `'display'`).
>     -   Default: `'removeDom'` (preserves existing behavior for standard columns).
> 
> 2.  **`src/grid/Body.mjs`**:
>     -   Modified `createRow` to render *all* columns during row creation, not just the mounted range.
>     -   Columns outside the `mountedColumns` range are now checked:
>         -   If `hideMode === 'removeDom'`, they are skipped (virtualized).
>         -   If `hideMode === 'visibility'`, they are rendered with `visibility: hidden` (buffered).
>         -   If `hideMode === 'display'`, they are rendered with `display: none` (buffered).
> 
> 3.  **`src/grid/column/Sparkline.mjs`**:
>     -   Set default `hideMode: 'visibility'`.
> 
> **Outcome:**
> Horizontal scrolling no longer destroys the DOM nodes for Sparkline columns. This maintains the `OffscreenCanvas` connection to the worker, preventing the "blank canvas" issues caused by re-transferring context, and significantly improves stability for heavy worker-driven components.

- 2026-02-03T12:32:37Z @tobiu assigned to @tobiu
- 2026-02-03T12:32:51Z @tobiu closed this issue

