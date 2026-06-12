---
id: 6265
title: 'list.Base: afterSetFocusIndex() => honor the mounted state'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-21T18:03:50Z'
updatedAt: '2025-01-21T18:29:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6265'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-21T18:29:33Z'
---
# list.Base: afterSetFocusIndex() => honor the mounted state

Right now, it triggers the Navigator inside `main`, even in case the list is not mounted.

Instead, there should be a new method which triggers main if mounted or delays the main access until being mounted.

## Timeline

- 2025-01-21T18:03:50Z @tobiu added the `enhancement` label
- 2025-01-21T18:03:50Z @tobiu assigned to @tobiu
- 2025-01-21T18:29:26Z @tobiu referenced in commit `1527a6f` - "list.Base: afterSetFocusIndex() => honor the mounted state #6265"
- 2025-01-21T18:29:33Z @tobiu closed this issue

