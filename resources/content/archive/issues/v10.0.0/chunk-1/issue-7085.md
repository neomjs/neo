---
id: 7085
title: Foundational Refactoring of the Effect Management System
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-20T17:29:29Z'
updatedAt: '2025-07-21T00:28:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7085'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-21T00:28:21Z'
---
# Foundational Refactoring of the Effect Management System

## Summary

This ticket documents a fundamental architectural change to the core reactivity system in Neo.mjs. We have refactored and unified the previously separate mechanisms for controlling effect execution into a single, robust system managed by `Neo.core.EffectManager`. This change introduces a clear distinction between **execution batching** and **dependency tracking suppression**, making the entire reactive system more predictable, powerful, and resilient to errors.

## Problem & Motivation

The previous reactivity system had two distinct and conflicting ways to control effect execution: a global `EffectManager.isPaused` flag and a separate `EffectBatchManager`. This dual-system approach led to several critical issues:

*   **Lack of Awareness**: The two systems were unaware of each other, leading to unpredictable behavior where effects would not run when expected.
*   **No Nesting Support**: The simple boolean flag could not handle nested `pause()`/`resume()` calls, breaking encapsulation.
*   **Self-Dependency Issues**: An effect could inadvertently create a dependency on its own internal state (e.g., its `isRunning` flag), leading to infinite loops.
*   **Code Complexity**: The logic was spread across multiple modules, making it difficult to reason about and maintain.

The core motivation for this change was to create a **single source of truth** for effect control, making the entire reactive system more robust, predictable, and maintainable.

## The New Architecture: A Unified `EffectManager`

The new architecture elevates `EffectManager` to be the sole controller of effect execution, managing two distinct but related concerns.

### 1. Execution Batching (`pause()` / `resume()`)

This is the primary mechanism for batching multiple state changes into a single, efficient UI update.

*   **Pause Counter**: The old `isPaused` boolean has been replaced with a numeric `pauseCounter`.
    *   `EffectManager.pause()` now increments this counter.
    *   `EffectManager.resume()` decrements the counter.
    *   Effects run immediately only when `pauseCounter === 0`. This provides robust, out-of-the-box support for nested pause calls.

*   **Integrated Effect Queue**:
    *   `EffectManager` now owns the `queuedEffects` set.
    *   Any effect that tries to run while `pauseCounter > 0` is automatically added to this queue.
    *   When `resume()` is called and `pauseCounter` returns to `0`, it automatically executes all queued effects.

*   **Robust Implementation**: All public APIs that perform bulk updates (`core.Base#set()`, `state.Provider#setData()`, and individual config setters) now wrap their logic in a `try...finally` block, guaranteeing that `EffectManager.resume()` is always called, even if an error occurs. This prevents the application from getting stuck in a paused state.

### 2. Dependency Tracking Suppression (`pauseTracking()` / `resumeTracking()`)

This is a new, specialized mechanism designed to solve the self-dependency problem.

*   **`isTrackingPaused` Flag**: This new boolean flag in `EffectManager` tells the system to temporarily stop the *active effect* from collecting new dependencies.
*   **Precise Control**: Unlike `pause()`, this does **not** stop effects from running or queue them. It is used internally within `Effect.prototype.run()` to safely get or set an effect's own state (like the `isRunning` flag) without creating a recursive dependency.

### 3. `EffectBatchManager` Removed

The `EffectBatchManager` singleton has been completely removed. Its functionality was fully absorbed by the enhanced `EffectManager`. The global `Neo.batch()` method now calls `EffectManager.pause()` and `EffectManager.resume()` directly.

## Benefits of the New System

1.  **Predictable & Unified**: There is one clear way to batch effect execution.
2.  **Robust Nesting**: Nested batches or pause calls now work flawlessly.
3.  **Clear Separation of Concerns**: The distinction between delaying execution (`pause`) and suppressing dependency collection (`pauseTracking`) eliminates ambiguity.
4.  **Resilience**: The `try...finally` pattern guarantees application stability, even when errors occur in user-defined hooks.
5.  **Simplified Architecture**: We have eliminated redundant logic, complex workarounds, and an entire singleton, making the system easier to understand and maintain.

## Timeline

- 2025-07-20T17:29:29Z @tobiu assigned to @tobiu
- 2025-07-20T17:29:30Z @tobiu added the `enhancement` label
- 2025-07-20T17:30:05Z @tobiu referenced in commit `16bdebe` - "Foundational Refactoring of the Effect Management System #7085"
- 2025-07-21T00:28:21Z @tobiu closed this issue

