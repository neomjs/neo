---
id: 3983
title: 'form.field.Text: set the input tag width to 100%'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-02-03T13:19:21Z'
updatedAt: '2023-02-03T13:19:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3983'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-03T13:19:50Z'
---
# form.field.Text: set the input tag width to 100%

We ran into some issues where TextFields broke grid columns defined via `grid-template-columns: repeat(10, 1fr);`.

The input itself did not have a width, but it broke the columns (a containing column got wider than all others).

## Timeline

- 2023-02-03T13:19:21Z @tobiu added the `enhancement` label
- 2023-02-03T13:19:21Z @tobiu assigned to @tobiu
- 2023-02-03T13:19:45Z @tobiu referenced in commit `78e45e0` - "form.field.Text: set the input tag width to 100% #3983"
- 2023-02-03T13:19:51Z @tobiu closed this issue

