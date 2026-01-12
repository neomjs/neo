---
id: 7088
title: Create Parallel Test Suite for Classic Button
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-21T11:22:57Z'
updatedAt: '2025-07-21T11:28:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7088'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-21T11:28:03Z'
---
# Create Parallel Test Suite for Classic Button

## Summary

This ticket tracks the creation of a new test suite for the classic `Neo.button.Base` component, located at `test/siesta/tests/classic/Button.mjs`. This test suite mirrors the structure and assertions of the test for the new `Neo.functional.button.Base`.

## Motivation

As the framework evolves to include both classic (class-based) and functional components, it is crucial to ensure that their public APIs and reactive behaviors are consistent. When a user switches from a classic button to a functional one (or vice-versa), the component should behave identically from an external perspective.

By creating a parallel test suite for the classic button that is a direct counterpart to the functional button's test, we can:
1.  **Verify API Consistency**: Ensure that setting configs like `text`, `iconCls`, and `pressed` produces the same VDOM delta outcomes.
2.  **Prevent Regressions**: Establish a baseline for the behavior of both component types, guarding against future changes that might cause them to diverge.
3.  **Improve Confidence**: Provide confidence that both component models are equally robust and reliable.

The successful passing of both test suites confirms that the abstraction holds and that both button implementations are aligned.

## Scope

1.  **Create `test/siesta/tests/classic/Button.mjs`**
    -   **Details**: The file will contain a Siesta test suite for `Neo.button.Base`.
    -   The tests will be adapted from `test/siesta/tests/functional/Button.mjs` to target the classic button.
    -   Assertions will verify initial VNode structure and the precise VDOM deltas generated on config changes.

## Acceptance Criteria

-   The test file `test/siesta/tests/classic/Button.mjs` is created and added to the repository.
-   The test suite within this file passes completely.
-   The tests successfully validate that `Neo.button.Base` produces the same VDOM deltas as its functional counterpart for identical operations.

## Timeline

- 2025-07-21T11:22:57Z @tobiu assigned to @tobiu
- 2025-07-21T11:22:58Z @tobiu added the `enhancement` label
- 2025-07-21T11:23:53Z @tobiu referenced in commit `0bbad89` - "Create Parallel Test Suite for Classic Button #7088"
- 2025-07-21T11:23:57Z @tobiu closed this issue
- 2025-07-21T11:27:50Z @tobiu reopened this issue
- 2025-07-21T11:28:00Z @tobiu referenced in commit `f6195ca` - "Create Parallel Test Suite for Classic Button #7088"
- 2025-07-21T11:28:03Z @tobiu closed this issue

