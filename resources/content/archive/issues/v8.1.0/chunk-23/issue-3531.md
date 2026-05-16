---
id: 3531
title: 'form.field.Text: reset()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-10-05T12:50:24Z'
updatedAt: '2022-10-05T12:51:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3531'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-10-05T12:51:01Z'
---
# form.field.Text: reset()

in case we call `reset()` without a value and have `clearToOriginalValue` set to true, the field should return to the original value instead of getting empty.

## Timeline

- 2022-10-05T12:50:24Z @tobiu added the `bug` label
- 2022-10-05T12:50:24Z @tobiu assigned to @tobiu
- 2022-10-05T12:50:42Z @tobiu referenced in commit `2168991` - "form.field.Text: reset() #3531"
- 2022-10-05T12:51:01Z @tobiu closed this issue

