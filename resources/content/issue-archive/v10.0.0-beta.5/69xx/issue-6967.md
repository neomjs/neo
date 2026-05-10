---
id: 6967
title: 'Feature: Core Reactivity Enhancements: Effect Dependency Tracking & Dynamic Functions'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-06T22:48:16Z'
updatedAt: '2025-07-06T23:45:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6967'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-06T23:45:42Z'
---
# Feature: Core Reactivity Enhancements: Effect Dependency Tracking & Dynamic Functions

## Description

This feature introduces fundamental enhancements to the Neo.mjs core reactivity system, enabling automatic and dynamic dependency tracking for
`Neo.core.Effect` instances and improving the flexibility of effect functions. These changes are crucial for building more robust and efficient reactive
components and data bindings.

## Motivation

To achieve truly automatic and dynamic reactivity, the `Neo.core.Effect` system needs a reliable mechanism to:
1.  **Automatically discover its dependencies:** Instead of manually declaring what data an effect depends on, the system should infer dependencies by
observing which reactive properties are accessed during the effect's execution.
2.  **Dynamically update dependencies:** The set of dependencies an effect relies on can change during its lifetime (e.g., due to conditional logic within
the effect's function). The system must be able to clear old dependencies and establish new ones on demand.

## Changes Made

1.  **`src/core/Config.mjs` - `get()` method modification:**
    *   The `get()` method of `Neo.core.Config` has been enhanced to integrate with the `Neo.core.EffectManager`.
    *   When an `Effect` is actively running (as determined by `EffectManager.getActiveEffect()`), any `Config` instance whose value is accessed via
`config.get()` will automatically register itself as a dependency of that active `Effect`.
    *   This change enables the `Effect` system to automatically track which `Config` instances its function relies on, replacing the need for manual
dependency declaration or static analysis (like regex parsing).

2.  **`src/core/Effect.mjs` - `fn` property as getter/setter:**
    *   The `fn` property of `Neo.core.Effect` has been converted into a getter/setter.
    *   Assigning a new function to `effect.fn` (e.g., `effect.fn = newFunction;`) now automatically triggers `effect.run()`.
    *   This ensures that whenever the effect's logic changes, its `run()` method is immediately invoked. The `run()` method, in turn, clears all previous
dependencies and re-establishes new ones based on the newly assigned function's execution. This is vital for effects whose dependency set changes
dynamically.

3.  **`test/siesta/tests/core/Effect.mjs` - Comprehensive Test Suite:**
    *   A dedicated test file has been created/updated to thoroughly validate the behavior of `Neo.core.Effect` and its interaction with `Neo.core.Config`
and `Neo.core.EffectManager`.
    *   The tests cover:
        *   Basic dependency tracking and re-execution on dependency change.
        *   The dynamic re-tracking of dependencies when `effect.fn` is reassigned, ensuring old dependencies are cleaned up and new ones are established.
        *   The correct functioning of `EffectManager`'s stack for managing active effects.

## Benefits

*   **True Automatic Reactivity:** Eliminates manual dependency management, making reactive programming more intuitive and less error-prone.
*   **Dynamic Dependency Sets:** Effects can now adapt to changing conditions within their functions, automatically tracking and reacting to new data
sources.
*   **Improved Code Clarity:** The core reactivity logic is encapsulated within `Effect` and `Config`, leading to cleaner and more declarative component
code.
*   **Foundation for Advanced Features:** These enhancements lay critical groundwork for more sophisticated reactive patterns, such as computed properties
and highly optimized data flows.

## Timeline

- 2025-07-06T22:48:16Z @tobiu assigned to @tobiu
- 2025-07-06T22:48:18Z @tobiu added the `enhancement` label
- 2025-07-06T23:29:53Z @tobiu referenced in commit `873cec0` - "Feature: Core Reactivity Enhancements: Effect Dependency Tracking & Dynamic Functions #6967"
- 2025-07-06T23:45:05Z @tobiu referenced in commit `2bf8804` - "#6967 tests/core/Effect: sum verification tests"
- 2025-07-06T23:45:42Z @tobiu closed this issue
- 2025-07-09T00:10:49Z @tobiu referenced in commit `a80f853` - "Feature: Core Reactivity Enhancements: Effect Dependency Tracking & Dynamic Functions #6967"
- 2025-07-09T00:10:50Z @tobiu referenced in commit `5d1db29` - "#6967 tests/core/Effect: sum verification tests"

