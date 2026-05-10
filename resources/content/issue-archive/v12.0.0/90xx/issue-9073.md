---
id: 9073
title: 'refactor: Ensure Drag & Drop Stability via ''internalId'''
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-02-09T10:50:13Z'
updatedAt: '2026-02-09T12:33:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9073'
author: tobiu
commentsCount: 1
parentIssue: 9074
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-09T12:33:03Z'
---
# refactor: Ensure Drag & Drop Stability via 'internalId'

**Context:**
Cross-store Drag & Drop (e.g., dragging a User to a Project) can fail if both entities share the same ID (e.g., `1`) but come from different stores.
With `internalId` (#9070), every item has a globally unique `neo-record-x` identifier.

**Task:**
Audit and update the Drag & Drop subsystems to leverage `internalId` for identifying dragged items.

**Requirements:**
1.  **DragZone:** Ensure that when a list/grid item is dragged, the `dragData` includes the `internalId`.
2.  **DropZone:** When dropping, use the `internalId` to resolve the original record from the source store, eliminating ambiguity.
3.  **Proxy:** Ensure the drag proxy element uses a stable ID.

**Scope:**
- `src/draggable/list/DragZone.mjs`
- `src/draggable/grid/DragZone.mjs`
- `src/draggable/DragZone.mjs`


## Timeline

- 2026-02-09T10:50:15Z @tobiu added the `ai` label
- 2026-02-09T10:50:15Z @tobiu added the `refactoring` label
- 2026-02-09T10:50:15Z @tobiu added the `core` label
- 2026-02-09T10:51:44Z @tobiu cross-referenced by #9074
- 2026-02-09T10:52:09Z @tobiu added parent issue #9074
- 2026-02-09T12:32:27Z @tobiu referenced in commit `97855cc` - "refactor: Ensure Drag & Drop Stability via 'internalId' (#9073)"
### @tobiu - 2026-02-09T12:32:40Z

**Input from Gemini 3 Pro:**

> ✦ **Task Completed: Ensure Drag & Drop Stability via 'internalId'**
> 
> **Objective:**
> Ensure that Drag & Drop operations are robust against the new `internalId` logic (avoiding PK lookup failures) and fix critical regressions exposed by the refactor.
> 
> **Key Fixes:**
> 
> 1.  **Grid Header Sorting (`SortZone.mjs`):**
>     *   **Regression Fix:** Fixed a critical issue where dragging columns containing heavy components (like OffscreenCanvas in Sparklines) destroyed the content.
>     *   **Root Cause:** `onDragEnd` called `super.onDragEnd` (which destroys the proxy) *before* moving the nodes back to the grid.
>     *   **Solution:** Reordered `onDragEnd` to restore DOM nodes from the proxy to the grid *before* initiating proxy destruction.
> 
> 2.  **List Drag & Drop (`ListDragZone.mjs`):**
>     *   **Robust Lookup:** Updated `setData` to handle `internalId` correctly.
>     *   **Logic:** It first attempts `store.get(recordId)` (PK lookup). If that fails, it scans the store for a matching `internalId`. This ensures drag data is correctly populated even when `List.Base` eventually switches to using `internalId` for DOM keys.
> 
> **Status:**
> Grid Row Drag & Drop does not exist yet, so no changes were required there. The Drag & Drop subsystem is now stable.

- 2026-02-09T12:32:56Z @tobiu assigned to @tobiu
- 2026-02-09T12:33:03Z @tobiu closed this issue

