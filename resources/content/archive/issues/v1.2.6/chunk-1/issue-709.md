---
id: 709
title: 'component.wrapper.AmChart: onMounted'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-12T19:31:11Z'
updatedAt: '2020-06-14T21:34:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/709'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-14T21:34:53Z'
---
# component.wrapper.AmChart: onMounted

before unmounting the component, we need to destroy the matching chart instance inside the main thread.

## Timeline

- 2020-06-12T19:31:12Z @tobiu added the `enhancement` label
- 2020-06-12T19:31:12Z @tobiu assigned to @tobiu
- 2020-06-14T15:10:37Z @tobiu referenced in commit `fbac998` - "#709 moved the event driven mounted logic into afterSetMounted()"
- 2020-06-14T21:34:53Z @tobiu closed this issue

