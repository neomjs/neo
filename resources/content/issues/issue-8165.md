---
id: 8165
title: Implement Configurable Theme Inheritance for Dragged Items
state: OPEN
labels:
  - enhancement
  - no auto close
  - ai
assignees: []
createdAt: '2025-12-27T21:33:10Z'
updatedAt: '2026-03-28T05:57:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8165'
author: tobiu
commentsCount: 1
parentIssue: 8163
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Configurable Theme Inheritance for Dragged Items

When dragging items between different browser windows (apps) that may have different themes (e.g., Dark Mode vs Light Mode), we need a configurable strategy for how the dragged item appears.

**Goal:**
Implement a `themeMode` config (e.g., `'adapt' | 'retain'`) on the Draggable/SortZone definition.
*   **Adapt:** The item temporarily or permanently adopts the CSS variables/theme of the target window context.
*   **Retain:** The item enforces its original theme (useful for "stickers" or branding).

**Current Behavior:**
The proxy clones the DOM/VDOM, likely carrying over classes, but if CSS variables are missing in the target, it may look broken.

## Timeline

- 2025-12-27T21:33:11Z @tobiu added the `enhancement` label
- 2025-12-27T21:33:11Z @tobiu added the `ai` label
- 2025-12-27T21:33:48Z @tobiu added parent issue #8163
### @github-actions - 2026-03-28T03:54:36Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-03-28T03:54:37Z @github-actions added the `stale` label
- 2026-03-28T05:57:14Z @tobiu removed the `stale` label
- 2026-03-28T05:57:14Z @tobiu added the `no auto close` label

