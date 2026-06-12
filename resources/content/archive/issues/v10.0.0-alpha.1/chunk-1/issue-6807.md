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

## Timeline

- 2025-06-15T19:59:29Z @tobiu assigned to @tobiu
- 2025-06-15T19:59:31Z @tobiu added parent issue #6785
- 2025-06-15T19:59:31Z @tobiu added the `enhancement` label
- 2025-06-15T19:59:55Z @tobiu referenced in commit `ba9d530` - "main.mixin.DeltaUpdates: du_insertNode() => use the new hasLeadingTextChildren #6807"
- 2025-06-15T20:00:46Z @tobiu closed this issue

