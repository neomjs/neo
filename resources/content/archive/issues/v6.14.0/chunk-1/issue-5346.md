---
id: 5346
title: 'form.field.Select: beforeSetValue() => onStoreLoad()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-03-15T14:22:20Z'
updatedAt: '2024-03-15T15:00:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5346'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-15T15:00:06Z'
---
# form.field.Select: beforeSetValue() => onStoreLoad()

it can happen, that we set the field value programmatically (e.g. loading a form) while the field list store has no data yet.

the old logic just grabbed the `value` config, which contained the ´recordId`.

this is no longer possible with the `inputValue` & `value` separation. we need a new flag (class field) to store it.

## Timeline

- 2024-03-15T14:22:20Z @tobiu added the `enhancement` label
- 2024-03-15T14:22:20Z @tobiu assigned to @tobiu
- 2024-03-15T14:59:59Z @tobiu referenced in commit `6171867` - "form.field.Select: beforeSetValue() => onStoreLoad() #5346"
- 2024-03-15T15:00:06Z @tobiu closed this issue
- 2024-03-26T16:29:47Z @tobiu referenced in commit `b60a3a1` - "form.field.Select: beforeSetValue() => onStoreLoad() #5346"

