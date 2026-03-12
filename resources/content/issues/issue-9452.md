---
id: 9452
title: Implement Thread-Agnostic Execution Mode for Connections
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T18:22:48Z'
updatedAt: '2026-03-12T18:25:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9452'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Thread-Agnostic Execution Mode for Connections

### Goal
Implement thread-agnostic execution for the Data Pipeline to prevent performance bottlenecks.

### Context
By default, heavy normalization (like shaping Tree Grids) should occur in the Data Worker so the App Worker isn't blocked. However, for pure streaming of massive datasets (like a 28MB `.jsonl` file with 50,000 users in the DevIndex app), forcing the data through the Data Worker creates an unnecessary bridge bottleneck. 

If no heavy transformation is needed, the `Connection -> Parser` pipeline should be able to execute directly inside the App Worker.

### Acceptance Criteria
- Introduce a configuration mechanism on `Neo.data.Connection` (e.g. `workerId: 'app' | 'data'`) that dictates where the network request and parser logic execute.
- If `workerId: 'app'`, the `Connection` natively calls `fetch()` in the App Worker.
- If `workerId: 'data'`, the `Connection` routes the request via Remote Method Access to the Data Worker (which manages the fetch, parser, and normalizer remotely).

## Timeline

- 2026-03-12T18:22:50Z @tobiu added the `enhancement` label
- 2026-03-12T18:22:50Z @tobiu added the `ai` label
- 2026-03-12T18:22:50Z @tobiu added the `architecture` label
- 2026-03-12T18:22:50Z @tobiu added the `core` label
- 2026-03-12T18:23:23Z @tobiu added parent issue #9449
- 2026-03-12T18:24:42Z @tobiu cross-referenced by #9449
- 2026-03-12T18:25:20Z @tobiu assigned to @tobiu

