---
id: 8046
title: '[AgentOS] Integrate DragProxyContainer for Swarm View live dragging'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-07T12:25:10Z'
updatedAt: '2025-12-07T12:52:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8046'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-07T12:52:40Z'
---
# [AgentOS] Integrate DragProxyContainer for Swarm View live dragging

We need to integrate the newly created `Neo.draggable.DragProxyContainer` into the AgentOS app to verify that "live component dragging" works as expected, particularly for the `Blackboard` component which uses an `OffscreenCanvas`.

**Goal:**
Enable live dragging for the Swarm View (Blackboard) so that the canvas connection persists during the drag operation, instead of creating a static, blank clone.

**Tasks:**
1.  **Update AgentOS Viewport:** Modify `apps/agentos/view/Viewport.mjs` (or the relevant dashboard configuration) to use `DragProxyContainer` for the dragging of the Swarm View panel.
    *   This likely involves configuring the `SortZone` or `DragZone` plugin/mixin for the `dashboard` container.
    *   We need to set the proxy configuration to use `Neo.draggable.DragProxyContainer`.
2.  **Verify Behavior:**
    *   Drag the Swarm View panel.
    *   Confirm that the canvas content remains visible and active (e.g., animations continue) during the drag.
    *   Confirm that the layout "gap" appears correctly in the background.
    *   Confirm that dropping the panel works and the layout stabilizes.

**Note:** This is a proof-of-concept verification for the new `DragProxyContainer` architecture.

## Timeline

- 2025-12-07T12:25:11Z @tobiu added the `enhancement` label
- 2025-12-07T12:25:11Z @tobiu added the `ai` label
- 2025-12-07T12:25:32Z @tobiu assigned to @tobiu
- 2025-12-07T12:52:31Z @tobiu referenced in commit `aa2630e` - "[AgentOS] Integrate DragProxyContainer for Swarm View live dragging #8046"
- 2025-12-07T12:52:40Z @tobiu closed this issue

