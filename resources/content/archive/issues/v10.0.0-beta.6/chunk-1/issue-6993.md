---
id: 6993
title: Create `Neo.component.mixin.VdomLifecycle`
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-09T10:52:00Z'
updatedAt: '2025-07-11T00:06:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6993'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-11T00:06:26Z'
---
# Create `Neo.component.mixin.VdomLifecycle`

### 1. Summary

Create a new mixin named `Neo.mixin.VdomLifecycle`. This mixin will encapsulate the core VDOM rendering engine logic currently located in `Neo.component.Base`. This is the foundational step for enabling the new functional component base class and for cleaning up the existing component architecture.

### 2. Rationale

The new reactivity layer introduced in v10, centered around `Neo.core.Config` and `Neo.core.Effect`, allows for a highly efficient and declarative component model. The `src/button/Effect.mjs` class serves as a proof-of-concept for this pattern, where a single `Effect` replaces dozens of imperative `afterSet` hooks.

This new, simpler component architecture relies on the ability to compose features using Mixins. With the recent enhancement enabling mixins to merge their `static config` into a consuming class, we can now create self-contained "feature mixins" (e.g., for VDOM management).

Extracting the VDOM logic from `component.Base` into `Neo.mixin.VdomLifecycle` is the foundational step. It will:
- Improve code modularity and separation of concerns.
- Slim down `component.Base`, making it easier to understand and maintain.
- Provide a reusable piece of core machinery that can be used by the new `FunctionalComponentBase` without inheriting all of `component.Base`.

### 3. Scope & Implementation Plan

1.  **Create File:** Create a new file at `src/mixin/VdomLifecycle.mjs`.
2.  **Identify & Move Logic:** Move the properties and methods related to the VDOM rendering engine from `src/component/Base.mjs` into `Neo.mixin.VdomLifecycle`. The list of candidates we previously identified will be used as the basis for this refactoring.
3.  **Refactor `component.Base`:** Modify `src/component/Base.mjs` to use the new `VdomLifecycle` mixin, ensuring all existing functionality remains intact.

### 4. Definition of Done

-   `Neo.mixin.VdomLifecycle` is created and contains the extracted VDOM logic.
-   `Neo.component.Base` uses the new mixin.
-   All existing component-related tests pass without regression, confirming the refactoring is successful.

## Timeline

- 2025-07-09T10:52:01Z @tobiu added parent issue #6992
- 2025-07-09T10:52:02Z @tobiu added the `enhancement` label
- 2025-07-11T00:04:42Z @tobiu changed title from **Create `Neo.mixin.VdomLifecycle`** to **Create `Neo.component.mixin.VdomLifecycle`**
- 2025-07-11T00:06:22Z @tobiu referenced in commit `ac2b5b8` - "Create Neo.component.mixin.VdomLifecycle #6993"
- 2025-07-11T00:06:26Z @tobiu closed this issue

