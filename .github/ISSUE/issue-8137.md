---
id: 8137
title: 'Feature Request: Component saveScrollPosition config'
state: OPEN
labels:
  - enhancement
  - ai
  - feature
assignees: []
createdAt: '2025-12-17T03:53:50Z'
updatedAt: '2025-12-17T03:53:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8137'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feature Request: Component saveScrollPosition config

Add a new config `saveScrollPosition` (default `true`) to `Neo.component.Abstract`.

**Goal:**
Automatically preserve the scroll position of a component's DOM nodes when they are unmounted and re-mounted (e.g., in `Card` layout or when moving components between windows).

**Implementation Strategy:**
1.  **Config:** Add `saveScrollPosition` to `Neo.component.Abstract`.
2.  **Listener:** In the `afterSet` hook, if true, subscribe to the global `scroll` event in `Neo.main.DomEvents` (which is already captured).
3.  **Handler:** In the scroll handler:
    *   Identify the related component and node.
    *   Find the corresponding node in the VDOM and VNode trees.
    *   Update the `scrollTop` / `scrollLeft` attributes in **both** the VDOM and VNode.
    *   **Crucial:** This operation MUST **NOT** trigger a VDOM update cycle. The goal is only to update the internal state (snapshot) so that *future* mounts restore this position. Since the DOM is already scrolled, applying a delta is unnecessary and wasteful.

This ensures that when the VNode is used to re-mount the component later, the `scrollTop`/`left` attributes are present in the instruction, restoring the user's context.

## Activity Log

- 2025-12-17 @tobiu added the `enhancement` label
- 2025-12-17 @tobiu added the `ai` label
- 2025-12-17 @tobiu added the `feature` label

