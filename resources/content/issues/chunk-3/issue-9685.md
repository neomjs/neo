---
id: 9685
title: Implement Neural Pruning and Graph GC
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T12:48:27Z'
updatedAt: '2026-04-04T18:02:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9685'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T18:02:20Z'
---
# Implement Neural Pruning and Graph GC

The Native Graph lacks a structural Garbage Collector to manage "Graph Entropy", leading to context saturation over time.

This epic covers:
1. Pushing explicit issue states (`OPEN`, `CLOSED`) into database node properties via Sandman (`Neo.ai.mcp.server.memory-core.services.DreamService`).
2. Implementing Edge Weight Time-Decay logic to naturally fade un-referenced correlations.
3. Enhancing the Context Priming Engine (`GraphService.getContextFrontier`) to actively filter paths routing through `CLOSED` state nodes.

## Timeline

- 2026-04-04T12:48:29Z @tobiu added the `epic` label
- 2026-04-04T12:48:29Z @tobiu added the `ai` label
- 2026-04-04T13:30:18Z @tobiu referenced in commit `b263ed9` - "feat: Implement Graph Database Garbage Collection and Headless Pipeline fixes (#9685)"
- 2026-04-04T13:30:29Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-04T18:02:19Z

Fixed via b263ed931fbae2483ff3265d8994d14e34a8541f

- 2026-04-04T18:02:20Z @tobiu closed this issue

