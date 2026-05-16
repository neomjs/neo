---
id: 5423
title: Compare the performance of BroadcastChannels to MessageChannels
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2024-06-17T14:26:13Z'
updatedAt: '2024-09-30T02:39:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5423'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-30T02:39:25Z'
---
# Compare the performance of BroadcastChannels to MessageChannels

So far we are using MessageChannels to connect the different realms. This is a bit cumbersome with forwarding ports, but works well.

We should do some benchmarking to compare it to:
https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API

Using them (with specific channel names) would remove the need to manually pass ports.

## Timeline

- 2024-06-17T14:26:13Z @tobiu added the `enhancement` label
### @github-actions - 2024-09-16T02:36:43Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-16T02:36:43Z @github-actions added the `stale` label
### @github-actions - 2024-09-30T02:39:25Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-30T02:39:26Z @github-actions closed this issue

