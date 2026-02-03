---
id: 8969
title: 'perf: Implement Batching and Silent Updates for Grid Scrolling (#8964)'
state: OPEN
labels:
  - enhancement
  - ai
  - performance
assignees: []
createdAt: '2026-02-03T18:31:11Z'
updatedAt: '2026-02-03T18:31:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8969'
author: tobiu
commentsCount: 0
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# perf: Implement Batching and Silent Updates for Grid Scrolling (#8964)

- Implement `silentVdomUpdate: true` for Row updates during high-frequency events (scrolling).
- Implement a batch flush mechanism in `Grid.Body` to send all row updates in a single VDOM delta message to the worker.

## Timeline

- 2026-02-03T18:31:12Z @tobiu added the `enhancement` label
- 2026-02-03T18:31:12Z @tobiu added the `ai` label
- 2026-02-03T18:31:13Z @tobiu added the `performance` label
- 2026-02-03T18:31:32Z @tobiu added parent issue #8964

