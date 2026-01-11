---
id: 6573
title: 'Use once: true for related listeners'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-03-12T11:24:17Z'
updatedAt: '2025-03-12T11:24:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6573'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-12T11:24:42Z'
---
# Use once: true for related listeners

* Housekeeping effort: there are still a couple of spots left, where we store the `listenerId` into a variable and are manually removing the listener when the callback triggers
* While this does work fine, the logic gets easier to read using `{once: true}`

## Timeline

- 2025-03-12T11:24:17Z @tobiu added the `enhancement` label
- 2025-03-12T11:24:37Z @tobiu referenced in commit `9f1dc24` - "Use once: true for related listeners #6573"
- 2025-03-12T11:24:42Z @tobiu closed this issue

