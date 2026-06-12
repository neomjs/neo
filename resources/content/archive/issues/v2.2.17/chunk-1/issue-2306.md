---
id: 2306
title: 'calendar.view.EditEventContainer: focus trap'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-07T06:01:41Z'
updatedAt: '2021-06-07T06:02:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2306'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-07T06:02:02Z'
---
# calendar.view.EditEventContainer: focus trap

the form is closing in case we click next to a form field.

we need a `tabIndex: -1` to prevent this.

## Timeline

- 2021-06-07T06:01:41Z @tobiu added the `enhancement` label
- 2021-06-07T06:01:41Z @tobiu assigned to @tobiu
- 2021-06-07T06:01:58Z @tobiu referenced in commit `4b59774` - "calendar.view.EditEventContainer: focus trap #2306"
- 2021-06-07T06:02:03Z @tobiu closed this issue

