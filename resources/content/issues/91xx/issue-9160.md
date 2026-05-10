---
id: 9160
title: 'test: Implement Computational Budget assertion in Grid Pooling tests'
state: OPEN
labels:
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-02-15T01:01:36Z'
updatedAt: '2026-02-15T01:01:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9160'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# test: Implement Computational Budget assertion in Grid Pooling tests

Recent performance optimizations in the Grid revealed that significant regressions (e.g., 7000+ redundant render calls) can occur silently without affecting the VDOM delta output or breaking functional tests.

**Goal:**
Enhance `test/playwright/unit/grid/Pooling.spec.mjs` to enforce a "Computational Budget".

**Tasks:**
1.  Inject a spy into `Neo.grid.column.Component.prototype.cellRenderer` within the test environment.
2.  Count the number of executions during a controlled vertical scroll operation.
3.  Assert that the execution count stays within an acceptable limit (e.g., < 100 for a 10-row scroll), effectively creating a performance regression guard.

This will catch "silent heaters" where the App Worker performs excessive work that is filtered out before reaching the Main Thread.

## Timeline

- 2026-02-15T01:01:37Z @tobiu added the `ai` label
- 2026-02-15T01:01:37Z @tobiu added the `testing` label
- 2026-02-15T01:01:37Z @tobiu added the `performance` label
- 2026-02-15T01:01:50Z @tobiu assigned to @tobiu

