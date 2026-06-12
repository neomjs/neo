---
id: 6609
title: 'main.addon.GoogleMaps: support for advanced markers'
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2025-04-01T19:59:24Z'
updatedAt: '2025-10-22T22:54:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6609'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-23T03:12:45Z'
---
# main.addon.GoogleMaps: support for advanced markers

The default markers API is sadly now deprecated:

<img width="1516" alt="Image" src="https://github.com/user-attachments/assets/f57d6482-e275-45d0-9f2b-a9eff8dea9c3" />

The advanced markers API requires a new API key, which is bound to a credit card:

<img width="1511" alt="Image" src="https://github.com/user-attachments/assets/78306d64-8f16-4cd4-9549-21b325450630" />

We do need an alternative, since we can no longer just drop a key into the Earthquakes tutorial.

Asking interested devs, who want to learn neo, to get an own key first would create too much of a barrier.

Creating an alternative first has a higher priority, but we need to get this addon functional again anyways.

@maxrahder @gplanansky

## Timeline

- 2025-04-01T19:59:24Z @tobiu added the `bug` label
### @gplanansky - 2025-04-09T17:23:15Z

I have had advanced markers working for some time.  I'll clean up and do a PR.

### @github-actions - 2025-07-09T03:04:24Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-07-09T03:04:25Z @github-actions added the `stale` label
### @github-actions - 2025-07-23T03:12:45Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2025-07-23T03:12:45Z @github-actions closed this issue

