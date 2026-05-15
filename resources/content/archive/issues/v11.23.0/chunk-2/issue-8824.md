---
id: 8824
title: 'test: Add Regression Tests for VDOM Race Conditions'
state: CLOSED
labels:
  - ai
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T03:28:17Z'
updatedAt: '2026-01-20T03:48:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8824'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T03:48:00Z'
---
# test: Add Regression Tests for VDOM Race Conditions

Adding a comprehensive suite of regression tests to prevent future regressions of the VDOM race conditions fixed in #8814.

Files:
- `test/playwright/unit/vdom/RaceCondition.spec.mjs`: Reproduction of the original "duplicate button" bug and other race scenarios.
- `test/playwright/unit/vdom/HelperNeoIgnore.spec.mjs`: Validates `VdomHelper` logic for skipping inserts on `neoIgnore`.
- `test/playwright/unit/vdom/TreeBuilder.spec.mjs`: Validates `TreeBuilder` expansion logic for unmounted/waking-up nodes.
- `test/playwright/unit/vdom/VdomLifecycle.spec.mjs`: Validates `mounted` and `vnode` lifecycle state consistency.

These tests serve as the long-term guardrails for the VDOM engine stability.

## Timeline

- 2026-01-20T03:28:18Z @tobiu added the `ai` label
- 2026-01-20T03:28:18Z @tobiu added the `testing` label
- 2026-01-20T03:28:18Z @tobiu added the `core` label
- 2026-01-20T03:31:03Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-20T03:48:01Z

already pushed.

- 2026-01-20T03:48:01Z @tobiu closed this issue

