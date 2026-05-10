---
id: 7089
title: Refactor Component Base Classes into a Common Abstract Class
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-21T11:59:17Z'
updatedAt: '2025-07-21T22:22:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7089'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-21T22:22:17Z'
---
# Refactor Component Base Classes into a Common Abstract Class

## Summary

This ticket tracks the architectural refactoring to create a new common base class, `Neo.component.Abstract`, for both classic (`Neo.component.Base`) and functional (`Neo.functional.component.Base`) components.

## Motivation

The component architecture previously had two separate base classes that, while using mixins, still contained a significant amount of duplicated code for lifecycle management, configuration, and core properties. This duplication increased maintenance overhead and made it difficult to ensure consistent behavior between the two component models.

By creating a shared `Abstract` base class, we achieve:
1.  **Improved Code Reusability**: Centralizes common logic (e.g., `set()`, `destroy()`, `mountedPromise`, core configs) in one place, following the DRY (Don't Repeat Yourself) principle.
2.  **Enhanced Consistency**: Guarantees that both classic and functional components share the exact same foundational implementation for core functionalities.
3.  **Simplified Maintenance**: Changes to the core component lifecycle only need to be made in one location.
4.  **Future-Proofing**: Provides a unified foundation to more easily add shared features, such as state provider and view controller support, to functional components in the future.

## Scope

1.  **Create `src/component/Abstract.mjs`**:
    -   A new base class that extends `Neo.core.Base`.
    -   It incorporates the `DomEvents`, `Observable`, and `VdomLifecycle` mixins.
    -   It contains the shared configs, properties, getters, and methods previously duplicated in both component base classes.

2.  **Refactor `src/component/Base.mjs`**:
    -   Change its `extends` clause from `Neo.core.Base` to `Neo.component.Abstract`.
    -   Remove all code that was moved into the new abstract class.

3.  **Refactor `src/functional/component/Base.mjs`**:
    -   Change its `extends` clause from `Neo.core.Base` to `Neo.component.Abstract`.
    -   Remove all code that was moved into the new abstract class.

## Acceptance Criteria

-   The file `src/component/Abstract.mjs` is created and implemented as described.
-   `Neo.component.Base` now extends `Neo.component.Abstract`.
-   `Neo.functional.component.Base` now extends `Neo.component.Abstract`.
-   Duplicated code has been removed from both child base classes.
-   All existing component-related tests continue to pass, verifying that the refactoring did not introduce regressions.

## Timeline

- 2025-07-21T11:59:17Z @tobiu assigned to @tobiu
- 2025-07-21T11:59:19Z @tobiu added the `enhancement` label
- 2025-07-21T12:26:24Z @tobiu referenced in commit `273349e` - "Refactor Component Base Classes into a Common Abstract Class #7089"
- 2025-07-21T12:47:54Z @tobiu referenced in commit `00028be` - "#7089 component.Abstract: removed listeners get/setup => made it a reactive config inside core.Observable."
- 2025-07-21T22:22:17Z @tobiu closed this issue

