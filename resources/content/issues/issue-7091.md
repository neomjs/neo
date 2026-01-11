---
id: 7091
title: Optimize `core.Observable#afterSetListeners` to perform a diff-based update
state: OPEN
labels:
  - enhancement
  - no auto close
assignees: []
createdAt: '2025-07-22T05:44:22Z'
updatedAt: '2025-10-21T07:23:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7091'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Optimize `core.Observable#afterSetListeners` to perform a diff-based update

## 1. Motivation

The current implementation of `afterSetListeners` in `Neo.core.Observable` is functional but inefficient for runtime updates. When the `listeners_` config is modified, the hook removes all previously declared listeners and re-adds all the new ones. This "brute-force" approach can cause unnecessary overhead, especially in dynamic applications where listener configurations might change.

The goal is to make this process more intelligent and performant.

## 2. Goal

Refactor the `afterSetListeners(value, oldValue)` method to perform a "diff" between the `oldValue` and `newValue` objects. The method should only apply the delta, rather than completely rebuilding the listener set.

This involves:
1.  **Identifying and Removing Listeners:** Iterate through `oldValue`. If a specific listener configuration does not exist in `newValue`, it should be removed via `un()`.
2.  **Identifying and Adding Listeners:** Iterate through `newValue`. If a listener does not exist in `oldValue`, or if its definition has changed, it should be added via `on()`.

This ensures that listeners added imperatively via `on()` remain unaffected and that only the necessary changes are made.

## 3. Acceptance Criteria

- The `afterSetListeners` method in `src/core/Observable.mjs` is updated to implement the diffing logic.
- Runtime changes to the `listeners_` config correctly add, remove, and update event listeners without affecting listeners that were not part of the config.
- All existing tests for `Observable` continue to pass.
- (Optional but recommended) New unit tests are created to specifically verify the diffing logic in various scenarios (add, remove, update).

## Timeline

- 2025-07-22T05:44:24Z @tobiu added the `enhancement` label
### @github-actions - 2025-10-21T02:46:05Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-10-21T02:46:06Z @github-actions added the `stale` label
- 2025-10-21T07:23:55Z @tobiu removed the `stale` label
- 2025-10-21T07:23:55Z @tobiu added the `no auto close` label

