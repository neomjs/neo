---
id: 8145
title: Fix AgentOS DnD state corruption and improve child app styling
state: OPEN
labels:
  - bug
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-19T16:18:10Z'
updatedAt: '2025-12-19T16:18:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8145'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix AgentOS DnD state corruption and improve child app styling

Fixes a bug in `AgentOS.view.ViewportController` where manual state manipulation (`widget.mounted = true`) caused issues when reintegrating widgets from popped-out windows.

Additionally, ensures correct styling for AgentOS child apps (`swarm` and `widget`) by adding `additionalThemeFiles` to their Viewports, matching the main application's theme.

## Activity Log

- 2025-12-19 @tobiu added the `bug` label
- 2025-12-19 @tobiu added the `enhancement` label
- 2025-12-19 @tobiu added the `ai` label

