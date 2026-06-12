---
id: 315
title: 'form.field.Select: list => select()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-03-18T13:53:03Z'
updatedAt: '2020-03-18T14:21:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/315'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-18T14:21:12Z'
---
# form.field.Select: list => select()

the list selection can get changed into a silent vdom update, since the field containing the list will receive the selected value and change the vdom anyway.

## Timeline

- 2020-03-18T13:53:03Z @tobiu added the `enhancement` label
- 2020-03-18T13:53:03Z @tobiu assigned to @tobiu
- 2020-03-18T14:20:36Z @tobiu referenced in commit `61bb7a7` - "form.field.Select: list => select() #315"
### @tobiu - 2020-03-18T14:21:12Z

to make it generic, selection.Model now checks if the owner view has a "silentSelect" config.

- 2020-03-18T14:21:12Z @tobiu closed this issue

