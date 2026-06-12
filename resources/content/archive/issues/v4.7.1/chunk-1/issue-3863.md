---
id: 3863
title: 'form.field.CheckBox: afterSetChecked()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-01-15T15:03:00Z'
updatedAt: '2023-01-15T15:03:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3863'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-15T15:03:47Z'
---
# form.field.CheckBox: afterSetChecked()

we can not use `util.Array:toggle()` here, since this can easily remove a valid base class.

new value:
`['fas', 'fa-check-square']`

old value:
`['fas', 'fa-square']`

no matter what you do, one direction => check or uncheck will break when using toggle().

Moving back to `add()` & `remove()`.

@maxrahder 

## Timeline

- 2023-01-15T15:03:00Z @tobiu added the `bug` label
- 2023-01-15T15:03:01Z @tobiu assigned to @tobiu
- 2023-01-15T15:03:35Z @tobiu referenced in commit `bcda884` - "form.field.CheckBox: afterSetChecked() #3863"
- 2023-01-15T15:03:47Z @tobiu closed this issue

