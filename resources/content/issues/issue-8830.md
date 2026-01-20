---
id: 8830
title: 'Stabilize VDOM Unit Tests: Eliminate ID Collisions in Parallel Execution'
state: CLOSED
labels:
  - ai
  - refactoring
  - testing
assignees:
  - tobiu
createdAt: '2026-01-20T16:12:48Z'
updatedAt: '2026-01-20T16:18:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8830'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T16:18:01Z'
---
# Stabilize VDOM Unit Tests: Eliminate ID Collisions in Parallel Execution

This ticket addresses the instability of the VDOM unit test suite when running with multiple workers (parallel execution).

**The Problem:**
Running `npm run test-unit` resulted in sporadic failures and numerous `[Base.mjs] Trying to create an item with an already existing id` errors. This was caused by several test files (specifically `RaceCondition.spec.mjs` and `TreeBuilder.spec.mjs`) using hardcoded component IDs (e.g., `'child-1'`, `'test-container'`). When Playwright executed these tests in parallel or reused workers without perfect cleanup, these IDs collided, leading to cross-test pollution and failures.

**The Solution:**
Refactor the affected test files to use **dynamic, unique IDs** for all components created during testing.
-   Introduced a helper function to generate unique IDs (e.g., `${prefix}-${timestamp}-${counter}`).
-   Updated `RaceCondition.spec.mjs` and `TreeBuilder.spec.mjs` to use these dynamic IDs.
-   Ensured proper cleanup of dynamically created components in `test.afterEach`.

**Outcome:**
The full unit test suite now passes consistently with 8 workers, with no ID collision errors.

## Timeline

- 2026-01-20T16:12:49Z @tobiu added the `ai` label
- 2026-01-20T16:12:49Z @tobiu added the `refactoring` label
- 2026-01-20T16:12:49Z @tobiu added the `testing` label
- 2026-01-20T16:17:26Z @tobiu referenced in commit `5c3ca3b` - "test: Stabilize VDOM Unit Tests: Eliminate ID Collisions in Parallel Execution (#8830)"
- 2026-01-20T16:17:40Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-20T16:17:49Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `RaceCondition.spec.mjs` and `TreeBuilder.spec.mjs` to use dynamic, unique IDs for all test components.
> 
> **Changes:**
> -   Implemented a `getUniqueId` helper in test files.
> -   Replaced hardcoded IDs (e.g., 'child-1') with generated ones (e.g., 'child-1-1705...').
> -   Updated teardown logic to track and destroy these dynamically named components.
> 
> **Verification:**
> `npm run test-unit` now passes 240/240 tests consistently with 8 workers, and the ID collision errors are gone.

- 2026-01-20T16:18:01Z @tobiu closed this issue

