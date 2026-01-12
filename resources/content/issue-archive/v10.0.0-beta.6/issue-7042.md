---
id: 7042
title: 'Regression: Neo.core.Effect.run() executes twice'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-07-13T11:57:01Z'
updatedAt: '2025-07-13T11:58:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7042'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-13T11:58:46Z'
---
# Regression: Neo.core.Effect.run() executes twice

**Describe the bug**
The `Neo.core.Effect.run()` method was executing an additional, unintended time, leading to incorrect behavior in reactive bindings. This was observed in tests where effects were expected to run only once initially, but were running twice.

**To Reproduce**
Steps to reproduce the behavior:
1. Run the test suite `tests/state/Provider.mjs`.
2. Observe failed assertions related to `effectRunCount`, such as:
   - `Binding effect should run once initially` (Expected: 1, Got: 2)
   - `Binding effect should re-run after setData` (Expected: 2, Got: 4)
   - Similar failures in hierarchical data access tests.

**Expected behavior**
The `Neo.core.Effect.run()` method should execute only once per intended trigger. The `effectRunCount` in the `tests/state/Provider.mjs` should match the expected values (e.g., 1 for initial run, 2 after first `setData`, etc.).

**Additional context**
This regression was introduced when the `isRunning` property of `Neo.core.Effect` was changed to a `Neo.core.Config` instance. The `Effect` was inadvertently subscribing to its own `isRunning` changes during its execution, creating a circular dependency that caused `run()` to be invoked recursively.

The fix involved strategically pausing and resuming `EffectManager`'s dependency tracking within the `Effect.run()` method to prevent the `Effect` from registering itself as a dependency of its own `isRunning` config during its execution, and to prevent recursive calls when `isRunning` was set.

## Timeline

- 2025-07-13T11:57:01Z @tobiu assigned to @tobiu
- 2025-07-13T11:57:02Z @tobiu added the `enhancement` label
- 2025-07-13T11:57:02Z @tobiu added parent issue #6992
- 2025-07-13T11:57:16Z @tobiu removed the `enhancement` label
- 2025-07-13T11:57:16Z @tobiu added the `bug` label
- 2025-07-13T11:57:44Z @tobiu referenced in commit `95dbb0b` - "Regression: Neo.core.Effect.run() executes twice #7042"
- 2025-07-13T11:58:46Z @tobiu closed this issue

