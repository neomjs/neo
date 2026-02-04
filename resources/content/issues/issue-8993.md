---
id: 8993
title: Fix Grid Empty View Regression on Column Change
state: CLOSED
labels:
  - bug
  - regression
assignees:
  - tobiu
createdAt: '2026-02-04T22:24:08Z'
updatedAt: '2026-02-04T22:26:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8993'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T22:26:50Z'
---
# Fix Grid Empty View Regression on Column Change

## Problem
When dynamically changing the number of columns in `Neo.grid.Container` (e.g., in the Big Data example), the Grid Body sometimes renders as empty (`<div id="grid-body"></div>` with no children), even though `Row` components exist in memory and are actively updating.

## Analysis
This is caused by a race condition or logic in `onStoreLoad` that clears `vdom.cn` (children references) but fails to repopulate them if `me.items` (Component instances) persists.
Specifically, `createViewData` iterates `me.items` and calls `updateContent` on them (triggering internal Row VDOM updates), but it **assumes** `GridBody.vdom.cn` still contains the references to these items. If `vdom.cn` was cleared (e.g., by a zero-item store load event or sync drift), `GridBody.update()` sends an empty child list to the VDOM worker, effectively detaching the rows from the DOM.

## Solution
Implement a **Self-Healing VDOM Strategy** in `GridBody.createViewData`.
Instead of relying on stateful `vdom.cn` persistence, `createViewData` should explicitly rebuild `vdom.cn` from the active `me.items` during every render pass.

**Logic:**
1.  Clear `vdomRoot.cn = []` before iterating rows.
2.  Inside the loop, push `item.createVdomReference()` to `vdomRoot.cn`.

This ensures the VDOM tree sent to the worker is always synchronized with the active Row components.

## Impact
Restores robustness to Grid rendering, fixing the "Empty View" regression during column re-configuration and preventing similar desync issues.

## Timeline

- 2026-02-04T22:24:09Z @tobiu added the `bug` label
- 2026-02-04T22:24:09Z @tobiu added the `regression` label
- 2026-02-04T22:25:39Z @tobiu referenced in commit `b7f2d9e` - "fix: Grid Empty View Regression - Implement Self-Healing VDOM Logic (#8993)"
- 2026-02-04T22:25:54Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-04T22:26:04Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the **Self-Healing VDOM Strategy** directly on the `dev` branch.
> 
> **Implementation Details:**
> In `GridBody.createViewData`:
> 1.  **Reset:** `vdomRoot.cn` is explicitly cleared to `[]` before the row iteration loop.
> 2.  **Rebuild:** Inside the loop, after updating each row's content, `vdomRoot.cn.push(item.createVdomReference())` is called.
> 
> This logic ensures that the VDOM tree sent to the worker is always strictly synchronized with the active Row components (`me.items`), recovering gracefully from any race conditions or logic (like `onStoreLoad`) that might have cleared the VDOM tree while preserving component instances.
> 
> **Fixed Commit:** `b7f2d9e47`
> **Status:** Fix applied and pushed to `dev`.

- 2026-02-04T22:26:50Z @tobiu closed this issue

