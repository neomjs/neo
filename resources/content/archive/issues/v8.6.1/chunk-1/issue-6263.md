---
id: 6263
title: main.DomAccess.getElement() => throws an error in case no id gets passed
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-01-21T17:23:52Z'
updatedAt: '2025-01-21T17:25:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6263'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-21T17:25:02Z'
---
# main.DomAccess.getElement() => throws an error in case no id gets passed

this one happens only inside the deployed online version (not reproducible locally), when opening the ComboBox dropdown for the first time.

![Image](https://github.com/user-attachments/assets/6290f669-5454-4df7-98d4-ac2e6902b9a5)

let us fix the "symptoms" first: the method should return `null` in case no node was found.

## Timeline

- 2025-01-21T17:23:52Z @tobiu added the `bug` label
- 2025-01-21T17:23:52Z @tobiu assigned to @tobiu
- 2025-01-21T17:24:50Z @tobiu referenced in commit `491c17a` - "main.DomAccess.getElement() => throws an error in case no id gets passed #6263"
- 2025-01-21T17:25:03Z @tobiu closed this issue
- 2025-01-21T17:33:58Z @tobiu cross-referenced by #6264

