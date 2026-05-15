---
id: 6478
title: 'component.MagicMoveText: add a cache for each measure result inside a given rotation'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-21T23:18:56Z'
updatedAt: '2025-02-21T23:57:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6478'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-21T23:57:06Z'
---
# component.MagicMoveText: add a cache for each measure result inside a given rotation

* No more measuring is needed, once the first rotation is complete with the cache
* As long as the size of the cmp itself does not change => We need a `ResizeObserver` to clear the cache if needed

## Timeline

- 2025-02-21T23:18:56Z @tobiu added the `enhancement` label
- 2025-02-21T23:18:56Z @tobiu assigned to @tobiu
- 2025-02-21T23:56:14Z @tobiu referenced in commit `c06e342` - "component.MagicMoveText: add a cache for each measure result inside a given rotation #6478"
- 2025-02-21T23:57:06Z @tobiu closed this issue

