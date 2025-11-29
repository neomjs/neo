---
id: 6807
title: 'main.mixin.DeltaUpdates: du_insertNode() => use the new hasLeadingTextChildren'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-15T19:59:29Z'
updatedAt: '2025-06-15T20:00:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6807'
author: tobiu
commentsCount: 0
parentIssue: 6785
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-15T20:00:46Z'
---
# main.mixin.DeltaUpdates: du_insertNode() => use the new hasLeadingTextChildren

* Since the vdom worker now takes care of it, we no longer need the hack to check for leading comments inside Main.

## Activity Log

- 2025-06-15 @tobiu assigned to @tobiu
- 2025-06-15 @tobiu added the `enhancement` label
- 2025-06-15 @tobiu referenced in commit `ba9d530` - "main.mixin.DeltaUpdates: du_insertNode() => use the new hasLeadingTextChildren #6807"
- 2025-06-15 @tobiu closed this issue

