---
id: 8145
title: Fix AgentOS DnD state corruption and improve child app styling
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-19T16:18:10Z'
updatedAt: '2025-12-19T16:19:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8145'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-19T16:19:09Z'
---
# Fix AgentOS DnD state corruption and improve child app styling

Fixes a bug in `AgentOS.view.ViewportController` where manual state manipulation (`widget.mounted = true`) caused issues when reintegrating widgets from popped-out windows.

Additionally, ensures correct styling for AgentOS child apps (`swarm` and `widget`) by adding `additionalThemeFiles` to their Viewports, matching the main application's theme.

## Timeline

- 2025-12-19T16:18:11Z @tobiu added the `bug` label
- 2025-12-19T16:18:11Z @tobiu added the `enhancement` label
- 2025-12-19T16:18:12Z @tobiu added the `ai` label
- 2025-12-19T16:18:30Z @tobiu assigned to @tobiu
- 2025-12-19T16:19:00Z @tobiu referenced in commit `ce2709c` - "Fix AgentOS DnD state corruption and improve child app styling #8145"
- 2025-12-19T16:19:09Z @tobiu closed this issue

