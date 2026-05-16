---
id: 4241
title: 'component.DateSelector: clicking the currently active date needs to trigger a change event'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-04-01T15:06:49Z'
updatedAt: '2023-04-01T15:09:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4241'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-01T15:09:49Z'
---
# component.DateSelector: clicking the currently active date needs to trigger a change event

important for `form.field.Date`:

while a DateField can have a value of `null`, this is not the case for `component.DateSelector`. Opening a DateField without a value and clicking on the current date should update the related form field.

## Timeline

- 2023-04-01T15:06:49Z @tobiu added the `enhancement` label
- 2023-04-01T15:06:50Z @tobiu assigned to @tobiu
- 2023-04-01T15:08:13Z @tobiu referenced in commit `715b0ec` - "component.DateSelector: clicking the currently active date needs to trigger a change event #4241"
- 2023-04-01T15:09:49Z @tobiu closed this issue

