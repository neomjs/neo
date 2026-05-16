---
id: 4303
title: 'form.field.Text: onInputValueChange() => logic not working properly'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-04-20T12:10:09Z'
updatedAt: '2023-04-20T12:10:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4303'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-20T12:10:31Z'
---
# form.field.Text: onInputValueChange() => logic not working properly

@Dinkh: the vnode always gets updated (even when resetting to the oldValue with a wrong input). if i recall it right this was related to your inputPattern addition.

i will fix the logic first and create a follow-up ticket for input patterns in general.

## Timeline

- 2023-04-20T12:10:09Z @tobiu added the `bug` label
- 2023-04-20T12:10:10Z @tobiu assigned to @tobiu
- 2023-04-20T12:10:26Z @tobiu referenced in commit `9c1afcd` - "form.field.Text: onInputValueChange() => logic not working properly #4303"
- 2023-04-20T12:10:31Z @tobiu closed this issue

