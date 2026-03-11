---
id: 9443
title: Stabilize Playwright Unit Tests by Centralizing Global Mocks
state: OPEN
labels:
  - bug
  - ai
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-03-11T14:27:13Z'
updatedAt: '2026-03-11T14:30:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9443'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Stabilize Playwright Unit Tests by Centralizing Global Mocks

### Goal
Resolve test cross-contamination issues caused by the "Single-Thread Simulation" architecture where Playwright workers reuse the same Node.js global state across multiple test files. Specifically, fix the `TypeError: Neo.currentWorker?.on is not a function` which breaks tests (like the Toolbar tests) when run collectively.

### Context
Currently, individual test files (like `CrossWindowMove.spec.mjs` and `ComboBoxInternalId.spec.mjs`) forcefully overwrite global mocks in `Neo` (e.g. `Neo.currentWorker = {}`) in their `beforeEach` blocks. Because Playwright reuses workers, these destructive overwrites persist and corrupt the environment for subsequent tests, leading to mysterious failures when running the full suite.

### Proposed Solution
1. **Centralize Mocks**: Update `test/playwright/setup.mjs` to provide a robust, standardized mock for `Neo.main`, `Neo.currentWorker`, `Neo.worker`, and `Neo.applyDeltas` out-of-the-box.
2. **Clean up Test Files**: Remove or safely refactor the individual `beforeEach` mock overrides in the ~11 affected test files so they either rely on the central mock or properly backup/restore their specific changes using `afterEach`.

## Timeline

- 2026-03-11T14:27:14Z @tobiu added the `bug` label
- 2026-03-11T14:27:14Z @tobiu added the `ai` label
- 2026-03-11T14:27:14Z @tobiu added the `testing` label
- 2026-03-11T14:27:15Z @tobiu added the `core` label
- 2026-03-11T14:30:37Z @tobiu assigned to @tobiu
- 2026-03-11T14:43:04Z @tobiu referenced in commit `672473b` - "test(unit): Centralize global mocks to prevent cross-contamination (#9443)"
- 2026-03-11T15:24:37Z @tobiu referenced in commit `967dd09` - "#9443 wip"

