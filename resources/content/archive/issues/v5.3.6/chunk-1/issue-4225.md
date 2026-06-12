---
id: 4225
title: 'form.field.CheckBox: afterSetChecked() => event params'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-03-30T07:34:22Z'
updatedAt: '2023-03-30T07:35:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4225'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-03-30T07:35:30Z'
---
# form.field.CheckBox: afterSetChecked() => event params

v5.3.3 introduced a bug. instead of the checked state (true or false), the event now always gets `this.value`, which is not correct for the unchecked value.

switching to `this.getValue()` should resolve it.

## Timeline

- 2023-03-30T07:34:22Z @tobiu added the `bug` label
- 2023-03-30T07:34:22Z @tobiu assigned to @tobiu
- 2023-03-30T07:34:59Z @tobiu referenced in commit `9f2e5e4` - "form.field.CheckBox: afterSetChecked() => event params #4225"
- 2023-03-30T07:35:31Z @tobiu closed this issue

