---
id: 4445
title: 'form.field.Currency: manually entering values'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-05-17T14:14:30Z'
updatedAt: '2023-05-17T15:04:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4445'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-17T15:04:33Z'
---
# form.field.Currency: manually entering values

adjusting values is hard, e.g. if you want to manually drop in 123 => it gets transformed into 1.00 while typing.

the transformations should happen on focus leave (or if the field does not have focus)

## Timeline

- 2023-05-17T14:14:31Z @tobiu added the `bug` label
- 2023-05-17T14:14:31Z @tobiu assigned to @tobiu
- 2023-05-17T15:03:35Z @tobiu referenced in commit `2d9a378` - "form.field.Currency: manually entering values #4445"
- 2023-05-17T15:04:33Z @tobiu closed this issue

