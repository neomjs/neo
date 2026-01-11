---
id: 8053
title: '[Draggable] Implement Manual DOM Delta Strategy for Live Component Dragging'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-07T19:01:11Z'
updatedAt: '2025-12-07T19:09:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8053'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-07T19:09:29Z'
---
# [Draggable] Implement Manual DOM Delta Strategy for Live Component Dragging

Implement a robust "Manual DOM Delta" strategy to enable dragging of live components without losing state.

**Problem:**
Dragging components typically involves moving them in the VDOM tree, which triggers a destroy/create cycle for the underlying DOM node. This breaks stateful elements like `OffscreenCanvas` or `Iframe` that rely on a persistent DOM instance.

**Solution:**
1.  **DragZone:** Update `createDragProxy` to use `Neo.applyDeltas` for a manual move operation.
    *   Instead of modifying the owner's `items` config (VDOM), we manually move the component's DOM node into the DragProxy.
    *   We manually insert a placeholder `vnode` (fetched via `Neo.vdom.Helper`) into the owner's DOM to maintain the layout gap.
    *   Configured `DragProxyContainer` with `parentComponent: me.owner` to maintain logical linkage for event bubbling.
    *   Ensured `neo-draggable` class is on the proxy config to support event delegation.

2.  **SortZone:** Update `onDragEnd` to perform a manual restoration.
    *   Before calling `moveTo` (which syncs the VDOM), we manually move the component's DOM node back to its correct visual position in the owner and remove the placeholder node.
    *   This ensures the VDOM update sees a DOM structure that matches its expectation, preventing a destructive reconciliation.
    *   Corrected `fromIndex` calculation to use `me.dragComponent` (live reference) instead of proxy items.
    *   Updated `updateItem` to handle the placeholder (mapped index -1) and redirect updates appropriately.

**Changed Files:**
*   `src/draggable/DragZone.mjs`
*   `src/draggable/container/SortZone.mjs`

## Timeline

- 2025-12-07T19:01:13Z @tobiu added the `enhancement` label
- 2025-12-07T19:01:13Z @tobiu added the `ai` label
- 2025-12-07T19:01:13Z @tobiu added the `architecture` label
- 2025-12-07T19:02:28Z @tobiu assigned to @tobiu
- 2025-12-07T19:05:38Z @tobiu referenced in commit `356532b` - "[Draggable] Implement Manual DOM Delta Strategy for Live Component Dragging #8053"
- 2025-12-07T19:09:29Z @tobiu closed this issue

