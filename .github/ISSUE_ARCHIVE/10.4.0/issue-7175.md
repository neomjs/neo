---
id: 7175
title: Refactor Grid ScrollManager to use `delayable`
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-11T07:54:23Z'
updatedAt: '2025-08-11T07:56:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7175'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-11T07:56:45Z'
---
# Refactor Grid ScrollManager to use `delayable`

**Reported by:** @tobiu on 2025-08-11

## Motivation

The previous implementation of `Neo.grid.ScrollManager` used a manual `setTimeout` with a `clearTimeout` call inside the `onBodyScroll` method to manage the `gridBody.isScrolling` flag. This approach, while functional, has several drawbacks:

1.  **Manual Implementation:** It bypasses the framework's built-in `delayable` feature, which is designed for exactly this purpose.
2.  **Inconsistency:** The logic was only applied to vertical scrolling (`onBodyScroll`), not horizontal scrolling (`onContainerScroll`).
3.  **Potential for Bugs:** Manual timer management can be more prone to edge cases and race conditions compared to a declarative, framework-level solution.

The goal of this refactoring was to improve scroll performance, increase code clarity, and ensure consistent behavior across all scroll directions by leveraging the `delayable` system.

## Changes Implemented

The `ScrollManager` was refactored with the following changes:

1.  **Throttled Scroll Handlers:**
    - Both `onBodyScroll` (vertical) and `onContainerScroll` (horizontal) are now configured as throttled `delayable` methods, limited to firing once every 16ms. This aligns event processing with a 60fps browser refresh rate, preventing scroll jank.

2.  **Debounced Scroll End Handler:**
    - A new `onBodyScrollEnd` method was created. Its sole responsibility is to set `gridBody.isScrolling = false`.
    - This new method is configured as a `delayable` with `{type: 'buffer', timer: 150}`. This acts as a trailing-edge debounce, ensuring it only executes once, 150ms after the user has completely stopped scrolling.

3.  **Simplified Logic:**
    - The manual `setTimeout`, `clearTimeout`, and the `scrollTimeoutId` property were removed from the class.
    - Both `onBodyScroll` and `onContainerScroll` now immediately set `body.isScrolling = true` and then call `me.onBodyScrollEnd()`, delegating the "scroll end" detection to the debounced method.

## Benefits

This refactoring provides several key benefits:

- **Improved Performance:** Throttling scroll events reduces the processing overhead during rapid scrolling, leading to a smoother user experience.
- **Enhanced Code Quality:** The code is now more declarative and easier to understand by using the framework's intended features (`delayable`) instead of manual timer logic.
- **Consistency:** Both vertical and horizontal scrolling now share the same robust mechanism for managing the `isScrolling` state.
- **Reduced Complexity:** The removal of manual timer management simplifies the `ScrollManager`'s implementation.

