---
id: 3203
title: 'form.field.Text: updateValidationIndicators()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-06-27T09:32:49Z'
updatedAt: '2022-06-27T09:43:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3203'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-27T09:43:22Z'
---
# form.field.Text: updateValidationIndicators()

we should move the logic to add the `neo-invalid` css rule outside of `afterSetValue()`, since other configs (if changed at run-time) affect the field validity as well (e.g. modifying the value of maxLength).

the new method could add error messages as well (follow up ticket(s)).

## Timeline

- 2022-06-27T09:32:49Z @tobiu added the `enhancement` label
- 2022-06-27T09:32:49Z @tobiu assigned to @tobiu
- 2022-06-27T09:43:19Z @tobiu referenced in commit `4831933` - "form.field.Text: updateValidationIndicators() #3203"
- 2022-06-27T09:43:23Z @tobiu closed this issue

