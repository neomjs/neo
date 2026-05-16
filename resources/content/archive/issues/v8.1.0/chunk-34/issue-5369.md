---
id: 5369
title: 'form.field.ComboBox: afterSetValue() => set programmaticValueChange to true before the super call'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-03-22T14:01:42Z'
updatedAt: '2024-03-22T14:21:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5369'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-22T14:21:37Z'
---
# form.field.ComboBox: afterSetValue() => set programmaticValueChange to true before the super call

and remove it from `beforeSetValue()`.

rationale: setting a field to the same value, will trigger beforeSet, but not afterSet, so the flag won't get removed again and this can cause issues for manual inputs.

## Timeline

- 2024-03-22T14:01:42Z @tobiu added the `bug` label
- 2024-03-22T14:01:43Z @tobiu assigned to @tobiu
- 2024-03-22T14:21:13Z @tobiu referenced in commit `bda10d4` - "form.field.ComboBox: afterSetValue() => set programmaticValueChange to true before the super call #5369"
- 2024-03-22T14:21:37Z @tobiu closed this issue
- 2024-03-26T16:29:50Z @tobiu referenced in commit `1e709c5` - "form.field.ComboBox: afterSetValue() => set programmaticValueChange to true before the super call #5369"

