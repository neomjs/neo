---
id: 2580
title: 'manager.Focus: setComponentFocus() => set the containsFocus flag for the entire cmp tree first'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-07T12:43:36Z'
updatedAt: '2021-07-07T12:46:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2580'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-07T12:46:45Z'
---
# manager.Focus: setComponentFocus() => set the containsFocus flag for the entire cmp tree first

then trigger the handlers & events.

this enables us for a `focusLeave` event to check if parent components still contain focus.

## Timeline

- 2021-07-07T12:43:36Z @tobiu added the `enhancement` label
- 2021-07-07T12:43:36Z @tobiu assigned to @tobiu
- 2021-07-07T12:44:03Z @tobiu referenced in commit `63ff3d8` - "manager.Focus: setComponentFocus() => set the containsFocus flag for the entire cmp tree first #2580"
- 2021-07-07T12:46:45Z @tobiu closed this issue

