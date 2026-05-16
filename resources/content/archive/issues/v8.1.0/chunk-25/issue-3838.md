---
id: 3838
title: 'main.DomEvents: getEventData() => remove event.path'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-01-10T11:40:37Z'
updatedAt: '2023-01-10T11:48:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3838'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-10T11:48:30Z'
---
# main.DomEvents: getEventData() => remove event.path

since `event.path` is now deprecated in Chrome, alls browsers should stick to `event.composedPath()`.

## Timeline

- 2023-01-10T11:40:37Z @tobiu added the `enhancement` label
- 2023-01-10T11:40:38Z @tobiu assigned to @tobiu
- 2023-01-10T11:48:14Z @tobiu referenced in commit `c9e56fa` - "main.DomEvents: getEventData() => remove event.path #3838"
- 2023-01-10T11:48:30Z @tobiu closed this issue

