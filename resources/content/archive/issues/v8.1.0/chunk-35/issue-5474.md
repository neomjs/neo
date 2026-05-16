---
id: 5474
title: 'component.Base: edge case where delta updates start when child updates are already in progress'
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2024-06-23T19:25:01Z'
updatedAt: '2024-10-06T02:38:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5474'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-06T02:38:03Z'
---
# component.Base: edge case where delta updates start when child updates are already in progress

![Screenshot 2024-06-23 at 21 22 52](https://github.com/neomjs/neo/assets/1177434/178a3c41-2bc4-4d95-8a82-85d2456e5196)

this one needs brainstorming. while we could further polish the edge-cases, the fine grained major updates version would resolve it out of the box: https://github.com/orgs/neomjs/discussions/5408

we need to make a decision into which direction to move forward.

## Timeline

- 2024-06-23T19:25:01Z @tobiu added the `bug` label
### @github-actions - 2024-09-22T02:36:36Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-22T02:36:36Z @github-actions added the `stale` label
### @github-actions - 2024-10-06T02:38:03Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-10-06T02:38:03Z @github-actions closed this issue

