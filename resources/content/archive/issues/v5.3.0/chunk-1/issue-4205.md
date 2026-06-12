---
id: 4205
title: 'form.field.Number: verify if manual inputs honor stepSizes < 1'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-03-24T09:35:35Z'
updatedAt: '2023-03-27T13:51:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4205'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-03-27T13:51:38Z'
---
# form.field.Number: verify if manual inputs honor stepSizes < 1

*(No description provided)*

## Timeline

- 2023-03-24T09:35:35Z @tobiu added the `enhancement` label
- 2023-03-24T09:35:35Z @tobiu assigned to @tobiu
- 2023-03-27T13:49:19Z @tobiu referenced in commit `598585c` - "form.field.Number: verify if manual inputs honor stepSizes < 1 #4205"
### @tobiu - 2023-03-27T13:51:38Z

i changed the number evaluation from `onInputValueChange()` to `onFocusLeave()`.

e.g. in case you want to type `0.01`, typing `0.0` would adjust the field value to `0` in real time, so it would be impossible to enter it manually (without using spin buttons or arrow keys).

so, it needs to be possible to enter "invalid" values and the field evaluation needs to happen when the field loses focus.

- 2023-03-27T13:51:38Z @tobiu closed this issue

