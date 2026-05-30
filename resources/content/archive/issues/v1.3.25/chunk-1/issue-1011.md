---
id: 1011
title: 'layout.Card: applyChildAttributes() => dynamic inserts'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-01T15:36:16Z'
updatedAt: '2020-08-01T15:37:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1011'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-01T15:37:10Z'
---
# layout.Card: applyChildAttributes() => dynamic inserts

With the new removeInactiveCards config, we need to adjust applyChildAttributes (3rd param), so that dynamically added items do not get removed from the dom right away (they will get activated most likely).

## Timeline

- 2020-08-01T15:36:16Z @tobiu added the `enhancement` label
- 2020-08-01T15:36:16Z @tobiu assigned to @tobiu
- 2020-08-01T15:37:10Z @tobiu closed this issue

