---
id: 9686
title: Add Graph Database Inspector Script
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T13:25:25Z'
updatedAt: '2026-04-05T14:54:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9686'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T18:02:36Z'
---
# Add Graph Database Inspector Script

The SQLite database powering the Native Graph needs a quick, non-abstracted diagnostic script for inspecting stored Nodes and Edges and verifying Sandman's extraction quality locally without booting the entire framework.

This ticket tracks the addition of `ai/examples/inspectGraph.mjs` and the inclusion of `better-sqlite3`.

## Timeline

- 2026-04-04T13:25:28Z @tobiu added the `enhancement` label
- 2026-04-04T13:25:28Z @tobiu added the `ai` label
- 2026-04-04T13:30:18Z @tobiu referenced in commit `d9e7a1a` - "feat: Add Graph Database SQLite inspector script (#9686)"
### @tobiu - 2026-04-04T18:02:36Z

Fixed via ai/examples/inspectGraph.mjs

- 2026-04-04T18:02:36Z @tobiu closed this issue
- 2026-04-05T14:54:52Z @tobiu assigned to @tobiu

