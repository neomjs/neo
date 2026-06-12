---
id: 4369
title: 'form.field.CheckBox: labelPosition : ''top'' has broken alignment'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-05-03T07:32:09Z'
updatedAt: '2023-05-03T09:03:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4369'
author: Ghost
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-03T09:03:14Z'
---
# form.field.CheckBox: labelPosition : 'top' has broken alignment

Checkbox label alignment breaks after this change : [https://github.com/neomjs/neo/commit/02b703ce97bfb7ac73099cce94a8a2f2519a5606](url)

## Timeline

- 2023-05-03T07:32:09Z @Ghost added the `bug` label
- 2023-05-03T07:57:21Z @tobiu referenced in commit `1835a9c` - "form.field.CheckBox: labelPosition : 'top' has broken alignment #4369"
- 2023-05-03T07:57:58Z @tobiu closed this issue
- 2023-05-03T08:04:33Z @tobiu reopened this issue
### @tobiu - 2023-05-03T08:05:02Z

needs more work. we now have 2x a label element (top level VS title lable).

- 2023-05-03T08:44:56Z @tobiu referenced in commit `964f71a` - "form.field.CheckBox: labelPosition : 'top' has broken alignment #4369"
### @tobiu - 2023-05-03T08:47:10Z

let's see if this approach works.

- 2023-05-03T08:55:08Z @tobiu referenced in commit `4e1e635` - "#4369 value label flex"
- 2023-05-03T09:03:14Z @tobiu closed this issue

