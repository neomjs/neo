---
id: 741
title: Application rendering timing
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-16T15:32:52Z'
updatedAt: '2020-06-16T15:33:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/741'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-16T15:33:46Z'
---
# Application rendering timing

we should add a short delay (10ms) so that initial routes can get applied BEFORE the main view of an app does get rendered.

layout.Card & tab.Container need to get adjusted.

## Timeline

- 2020-06-16T15:32:52Z @tobiu added the `enhancement` label
- 2020-06-16T15:32:52Z @tobiu assigned to @tobiu
- 2020-06-16T15:33:17Z @tobiu referenced in commit `a7d4310` - "Application rendering timing #741"
- 2020-06-16T15:33:46Z @tobiu closed this issue

