---
id: 5594
title: 'model.Component: data property setter => getting the same value for dates'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-20T16:35:25Z'
updatedAt: '2024-07-20T16:35:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5594'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-20T16:35:58Z'
---
# model.Component: data property setter => getting the same value for dates

when accessing a VM date prop, we get the same instance instead of a copy.

so, when changing it, oldValue & value would stay the same and `onDataPropertyChange()` won't get executed.

concrete use case: inside the calendar widget, the arrow buttons next to the "Today" button no longer work.

## Timeline

- 2024-07-20T16:35:25Z @tobiu added the `enhancement` label
- 2024-07-20T16:35:25Z @tobiu assigned to @tobiu
- 2024-07-20T16:35:49Z @tobiu referenced in commit `315d009` - "model.Component: data property setter => getting the same value for dates #5594"
- 2024-07-20T16:35:58Z @tobiu closed this issue

