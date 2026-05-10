---
id: 9711
title: '[Unit Tests] Verify queryNodeTopology and query_hybrid_graph'
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-04-04T21:33:10Z'
updatedAt: '2026-04-04T21:35:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9711'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T21:35:22Z'
---
# [Unit Tests] Verify queryNodeTopology and query_hybrid_graph

This ticket tracks adding unit tests in `test/playwright/unit/ai/mcp/server/memory-core/services/GraphService.spec.mjs` to systematically verify:
1. `GraphService.queryNodeTopology(nodeId, maxDepth)` correctly traverses up to the maximum depth requested.
2. Ensure the returned format accurately bridges the graph extraction format required by memory-core endpoints.
3. Validate node traversal paths respect cyclic references without infinite loops natively.

## Timeline

- 2026-04-04T21:33:11Z @tobiu added the `enhancement` label
- 2026-04-04T21:33:11Z @tobiu added the `ai` label
- 2026-04-04T21:33:11Z @tobiu added the `testing` label
- 2026-04-04T21:33:30Z @tobiu assigned to @tobiu
- 2026-04-04T21:35:21Z @tobiu referenced in commit `94004a9` - "test: Implement deep BFS topology extraction and add tests (#9711)"
### @tobiu - 2026-04-04T21:35:22Z

Implemented maxDepth traversal in GraphService and verified with Playwright tests locally.

- 2026-04-04T21:35:23Z @tobiu closed this issue

