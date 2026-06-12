---
id: 2280
title: 'calendar.view.week.Component: resize handles should appear after a drop OP'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-05T22:51:16Z'
updatedAt: '2021-06-06T11:07:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2280'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-06T11:07:30Z'
---
# calendar.view.week.Component: resize handles should appear after a drop OP

right now, you need to move the cursor outside of the event and enter it again.

i think it is probably best to remove the handle from the real event `onDragStart()`.

## Timeline

- 2021-06-05T22:51:16Z @tobiu added the `enhancement` label
- 2021-06-05T22:51:16Z @tobiu assigned to @tobiu
- 2021-06-06T11:07:26Z @tobiu referenced in commit `d0a68f1` - "calendar.view.week.Component: resize handles should appear after a drop OP #2280"
- 2021-06-06T11:07:30Z @tobiu closed this issue

