---
id: 5555
title: 'vdom.Helper: createDeltas() => switch to a "pull in" strategy'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-10T12:59:45Z'
updatedAt: '2024-07-10T13:00:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5555'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-10T13:00:26Z'
---
# vdom.Helper: createDeltas() => switch to a "pull in" strategy

to make the resulting deltas order more predictable, arrays shall:
1. pull in nodes which are not there yet
2. do NOT push out nodes into unprocessed other arrays (they will get picked up there)

## Timeline

- 2024-07-10T12:59:45Z @tobiu added the `enhancement` label
- 2024-07-10T12:59:45Z @tobiu assigned to @tobiu
- 2024-07-10T13:00:16Z @tobiu referenced in commit `a768645` - "vdom.Helper: createDeltas() => switch to a "pull in" strategy #5555"
- 2024-07-10T13:00:26Z @tobiu closed this issue
- 2024-07-10T13:02:28Z @tobiu referenced in commit `557dc17` - "#5555 cleanup"

