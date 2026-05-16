---
id: 4831
title: 'form.Container: setConfigs()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-09-04T12:08:19Z'
updatedAt: '2023-09-04T12:08:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4831'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-04T12:08:49Z'
---
# form.Container: setConfigs()

2 issues:

1. radios needs to get checked before checkboxes, since the condition `checkbox instanceof radio` returns true (class inheritance)
2. we need to delete `fieldConfigs.value` after modifying the checked state, since it would overwrite it otherwise

## Timeline

- 2023-09-04T12:08:19Z @tobiu added the `bug` label
- 2023-09-04T12:08:19Z @tobiu assigned to @tobiu
- 2023-09-04T12:08:46Z @tobiu referenced in commit `7f6ba3c` - "form.Container: setConfigs() #4831"
- 2023-09-04T12:08:49Z @tobiu closed this issue

