---
id: 2383
title: 'calendar.view.week.EventDragZone: dragEnd() => endDate for non resize OPs'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-06-17T13:43:58Z'
updatedAt: '2021-06-17T13:44:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2383'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-17T13:44:21Z'
---
# calendar.view.week.EventDragZone: dragEnd() => endDate for non resize OPs

this one broke after switching to `DateUtil.clone()` due to a wrong input.

## Timeline

- 2021-06-17T13:43:58Z @tobiu added the `bug` label
- 2021-06-17T13:43:58Z @tobiu assigned to @tobiu
- 2021-06-17T13:44:16Z @tobiu referenced in commit `883123e` - "calendar.view.week.EventDragZone: dragEnd() => endDate for non resize OPs #2383"
- 2021-06-17T13:44:21Z @tobiu closed this issue

