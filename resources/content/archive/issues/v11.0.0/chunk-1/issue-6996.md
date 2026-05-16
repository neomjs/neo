---
id: 6996
title: Encourage Pure VDOM Effects
state: CLOSED
labels:
  - enhancement
  - no auto close
assignees: []
createdAt: '2025-07-09T10:57:03Z'
updatedAt: '2025-10-24T10:07:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6996'
author: tobiu
commentsCount: 2
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-24T10:07:08Z'
---
# Encourage Pure VDOM Effects

### 1. Summary

Define and promote best practices for writing "pure" VDOM-generating methods (e.g., `createVdom()`) within functional components. This ensures that the output of these methods is solely determined by their inputs (component configs) and that they produce no side effects, which is crucial for predictability and enabling future optimizations like memoization.

### 2. Rationale

The `Neo.core.Effect` system automatically re-executes VDOM-generating methods when their dependencies changes. For this system to be truly robust and performant, these methods should ideally be pure functions. Purity makes components easier to reason about, test, and debug. It also unlocks significant performance gains through memoization, as the output can be safely cached if inputs remain unchanged.

### 3. Scope & Implementation Plan

1.  **Define Purity Guidelines:** Clearly document what constitutes a "pure" VDOM-generating method in the context of Neo.mjs functional components. This includes avoiding direct DOM manipulation, external state modification, or reliance on non-reactive global state within `createVdom()`.
2.  **Documentation:** Add a section to the functional component documentation explaining the concept of pure effects and why it's important.
3.  **Linting/Static Analysis (Optional, Future):** Explore the possibility of adding linting rules or static analysis checks to identify potential impurities in `createVdom()` methods.

### 4. Definition of Done

-   Clear guidelines for writing pure VDOM-generating methods are documented.
-   The documentation explains the benefits of purity and provides examples.

## Timeline

- 2025-07-09T10:57:05Z @tobiu added parent issue #6992
- 2025-07-09T10:57:05Z @tobiu added the `enhancement` label
### @github-actions - 2025-10-08T02:38:39Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-10-08T02:38:40Z @github-actions added the `stale` label
- 2025-10-08T09:39:48Z @tobiu removed the `stale` label
- 2025-10-08T09:39:48Z @tobiu added the `no auto close` label
### @tobiu - 2025-10-24T10:07:09Z

dropped

- 2025-10-24T10:07:09Z @tobiu closed this issue

