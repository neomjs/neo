---
id: 5128
title: 'form.Container: async getFormState()'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2023-12-04T13:25:58Z'
updatedAt: '2024-09-12T02:29:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5128'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:04Z'
---
# form.Container: async getFormState()

the logic is similar to `isValid()`, but will contain 4 different states.
the return value is a string (enum)

- clean => all fields are clean (untouched)
- error => at least one field is invalid
- valid => all required fields are valid
- inProgress => at least one field is valid, at least one field is clean

## Timeline

- 2023-12-04T13:25:58Z @tobiu added the `enhancement` label
- 2023-12-04T13:25:59Z @tobiu assigned to @tobiu
- 2023-12-04T13:35:16Z @tobiu referenced in commit `57a0350` - "form.Container: async getFormState() #5128"
- 2023-12-04T15:05:45Z @tobiu referenced in commit `a1c37f3` - "#5128 updated the logic & adjusted apps/form to use the new method for SideNav updates"
- 2023-12-11T11:36:02Z @tobiu referenced in commit `46ec062` - "#5128 empty & required TextFields must not count as invalid"
- 2023-12-11T15:10:55Z @tobiu referenced in commit `269313b` - "#5128 form.field.Text: useAlertState_ & styling"
- 2023-12-11T15:20:26Z @tobiu referenced in commit `35ecb29` - "#5128 form.field.Text: isEmptyAndRequired()"
### @github-actions - 2024-08-29T02:26:15Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:15Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:04Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:04Z @github-actions closed this issue

