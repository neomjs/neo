---
id: 6443
title: 'grid.View: createViewData() => remove the store count check'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-11T20:07:05Z'
updatedAt: '2025-02-11T20:09:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6443'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-11T20:09:12Z'
---
# grid.View: createViewData() => remove the store count check

* the idea was that we could skip the fn body in case the store was not loaded for the very first time
* however, this does affect filtering the store down to zero

## Timeline

- 2025-02-11T20:07:05Z @tobiu added the `enhancement` label
- 2025-02-11T20:07:05Z @tobiu assigned to @tobiu
- 2025-02-11T20:07:27Z @tobiu referenced in commit `fb5197d` - "grid.View: createViewData() => remove the store count check #6443"
- 2025-02-11T20:09:13Z @tobiu closed this issue

