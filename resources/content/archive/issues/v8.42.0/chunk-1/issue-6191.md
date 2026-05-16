---
id: 6191
title: 'util.Logger: ensure component parent paths do not contain duplicate items'
state: CLOSED
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-01-08T10:54:05Z'
updatedAt: '2025-04-09T10:00:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6191'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-09T10:00:30Z'
---
# util.Logger: ensure component parent paths do not contain duplicate items

`manager.Component` does now honor wrapper node ids for wrapped components.

as a side effect, cmps can now get found twice => for the node id and for the wrapper node id:

![Image](https://github.com/user-attachments/assets/fd4aed49-13a9-44f1-a815-1ece41a70455)

changing the logger would be like fixing the symptoms. to address the root cause, `manager.Component` should not return duplicate matches => i might address this one instead.

## Timeline

- 2025-01-08T10:54:05Z @tobiu added the `enhancement` label
- 2025-01-08T10:54:06Z @tobiu assigned to @tobiu
### @github-actions - 2025-04-09T02:44:13Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-04-09T02:44:13Z @github-actions added the `stale` label
- 2025-04-09T08:35:53Z @tobiu removed the `stale` label
- 2025-04-09T08:35:53Z @tobiu added the `no auto close` label
- 2025-04-09T09:56:26Z @tobiu referenced in commit `2069db9` - "util.Logger: ensure component parent paths do not contain duplicate items #6191"
- 2025-04-09T10:00:30Z @tobiu closed this issue

