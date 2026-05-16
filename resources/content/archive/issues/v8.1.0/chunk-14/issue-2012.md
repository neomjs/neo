---
id: 2012
title: Neo.config.renderCountDeltas
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-10T09:16:47Z'
updatedAt: '2021-05-10T10:26:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2012'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-10T10:26:00Z'
---
# Neo.config.renderCountDeltas

{Boolean}

idea: if set to true main threads will check for a node with a specific id. in case it does exist, show the amount of delta updates per second.

A specific node (dom id) is great for integrating the counter into apps at specific spots.

We could add an overlay in case the node does not exist (follow up in case you want this).

## Timeline

- 2021-05-10T09:16:47Z @tobiu added the `enhancement` label
- 2021-05-10T09:16:47Z @tobiu assigned to @tobiu
- 2021-05-10T09:22:28Z @tobiu referenced in commit `fa2d9ed` - "Neo.config.renderCountDeltaUpdates #2012"
- 2021-05-10T09:34:49Z @tobiu changed title from **Neo.config.renderCountDeltaUpdates** to **Neo.config.renderCountDeltas**
- 2021-05-10T09:35:36Z @tobiu referenced in commit `3c0da94` - "#2012 added the config into the covid helix example app"
- 2021-05-10T10:01:03Z @tobiu referenced in commit `4e9a1f3` - "#2012 logic to get the count every 100ms"
- 2021-05-10T10:25:53Z @tobiu referenced in commit `ac49283` - "Neo.config.renderCountDeltas #2012 adjusted the helix example"
- 2021-05-10T10:26:00Z @tobiu closed this issue

