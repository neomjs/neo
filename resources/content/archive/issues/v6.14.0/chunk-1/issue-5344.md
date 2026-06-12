---
id: 5344
title: 'form.field.Select: updateValueFromInputValue()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-03-15T13:56:17Z'
updatedAt: '2024-03-18T08:19:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5344'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-18T08:19:39Z'
---
# form.field.Select: updateValueFromInputValue()

when a user types into the inputField, we want to (silently) reset the value (record) of the field.

however, if we programmatically change the value and this updates the content of the input tag, this must not happen.

since both, user driven and programmatic changes trigger the same DOM events, it is non-trivial to spot the difference. one (workaround) way to do it would be to check if the control has focus (assuming then that changes are user-driven).

another maybe better way: `beforeSetValue()` could set a flag, that the next input field change will be programmatic and `afterSetValue()` could remove it.

@ExtAnimal 

## Timeline

- 2024-03-15T13:56:17Z @tobiu added the `enhancement` label
- 2024-03-15T13:56:17Z @tobiu assigned to @tobiu
- 2024-03-15T13:58:02Z @tobiu cross-referenced by #5345
### @tobiu - 2024-03-18T08:19:39Z

resolved

- 2024-03-18T08:19:39Z @tobiu closed this issue

