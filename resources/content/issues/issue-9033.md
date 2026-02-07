---
id: 9033
title: 'Refactor: DevRank Spider Checkpointing'
state: OPEN
labels:
  - enhancement
  - performance
assignees: []
createdAt: '2026-02-07T19:01:23Z'
updatedAt: '2026-02-07T19:01:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9033'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: DevRank Spider Checkpointing

Implement incremental saving in the `Spider` service to prevent data loss during long discovery runs.

**Changes:**
- `Spider.mjs`: Save `tracker.json` (candidates) and `visited.json` (graph) after processing every page of search results (or every N repositories).

## Timeline

- 2026-02-07T19:01:24Z @tobiu added the `enhancement` label
- 2026-02-07T19:01:24Z @tobiu added the `performance` label
- 2026-02-07T19:01:40Z @tobiu added parent issue #8930

