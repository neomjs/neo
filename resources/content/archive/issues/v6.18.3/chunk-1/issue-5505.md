---
id: 5505
title: 'main.addon.ResizeObserver: register() => in case a node is not found, try again after a delay for a defined number of times'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-01T09:08:19Z'
updatedAt: '2024-07-01T09:08:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5505'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-01T09:08:48Z'
---
# main.addon.ResizeObserver: register() => in case a node is not found, try again after a delay for a defined number of times

e.g. 3 times with a 100ms delay.

rationale: in this call arrives too early (shortly before a node gets mounted), the observer would never get the item to observe.

## Timeline

- 2024-07-01T09:08:19Z @tobiu added the `enhancement` label
- 2024-07-01T09:08:19Z @tobiu assigned to @tobiu
- 2024-07-01T09:08:37Z @tobiu referenced in commit `64f6d82` - "main.addon.ResizeObserver: register() => in case a node is not found, try again after a delay for a defined number of times #5505"
- 2024-07-01T09:08:48Z @tobiu closed this issue

