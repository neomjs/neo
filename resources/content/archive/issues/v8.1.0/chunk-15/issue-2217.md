---
id: 2217
title: 'calendar.view.WeekComponent: make events resizable (north and south)'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-31T10:40:52Z'
updatedAt: '2021-06-03T22:32:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2217'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-03T22:32:00Z'
---
# calendar.view.WeekComponent: make events resizable (north and south)

a bit tricky, since the resizing needs to happen inside the app worker, to make it "snappy" => only resize to valid time positions.

similar to the `drag:move` logic.

## Timeline

- 2021-05-31T10:40:52Z @tobiu added the `enhancement` label
- 2021-05-31T10:40:52Z @tobiu assigned to @tobiu
- 2021-06-03T22:31:52Z @tobiu referenced in commit `6798c98` - "#2217 south handle event resizing logic"
- 2021-06-03T22:32:00Z @tobiu closed this issue

