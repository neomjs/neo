---
id: 8206
title: Refactor Client Services to use Parameter Destructuring
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-29T23:27:18Z'
updatedAt: '2025-12-29T23:36:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8206'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T23:36:13Z'
---
# Refactor Client Services to use Parameter Destructuring

**Context:**
To improve code readability and maintainability, we want to standardize the method signatures in our client-side AI services.

**Goal:**
Refactor all methods in `src/ai/client/*.mjs` that currently accept a single `params` object and manually destructure it inside the function body. They should instead use parameter destructuring directly in the function signature.

**Scope:**
1.  **Analyze:**
    -   `src/ai/client/ComponentService.mjs`
    -   `src/ai/client/DataService.mjs`
    -   `src/ai/client/RuntimeService.mjs`
2.  **Refactor:**
    -   Identify methods like `myMethod(params) { let {a, b} = params; ... }`.
    -   Change to `myMethod({a, b}) { ... }`.
    -   Update JSDoc to reflect the changes (if needed, though param names usually stay the same, just the syntax changes).

**Acceptance Criteria:**
-   All relevant methods in the target files use signature destructuring.
-   No functionality is broken (verify with basic checks or existing tests if available).


## Timeline

- 2025-12-29T23:27:20Z @tobiu added the `ai` label
- 2025-12-29T23:27:20Z @tobiu added the `refactoring` label
- 2025-12-29T23:27:27Z @tobiu added parent issue #8169
- 2025-12-29T23:27:55Z @tobiu assigned to @tobiu
- 2025-12-29T23:36:07Z @tobiu referenced in commit `77a7371` - "Refactor Client Services to use Parameter Destructuring #8206"
- 2025-12-29T23:36:14Z @tobiu closed this issue

