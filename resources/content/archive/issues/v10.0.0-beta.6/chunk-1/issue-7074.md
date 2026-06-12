---
id: 7074
title: Improve Functional Component Initial Render Timing
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-16T11:29:11Z'
updatedAt: '2025-07-16T11:30:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7074'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-16T11:30:39Z'
---
# Improve Functional Component Initial Render Timing

## Problem

There was a subtle but critical timing issue in how functional components handled their initial render, which manifested differently depending on their context.

1.  **The Core Issue:** When a functional component is created, its `vdomEffect` runs synchronously to generate the initial VDOM. However, the logic to *process* this VDOM (`onEffectRunStateChange`) was handled by a subscription that was established *after* the effect's first run. This meant the component's `vdom` property was not populated at the end of its constructor.

2.  **Symptom A (Nested Components):** When a functional component was nested inside a classic container, the parent container needed the child's `vdom` immediately during its own render cycle. Because the child's `vdom` wasn't ready, the child would not render correctly on the initial pass.

3.  **Symptom B (The Workaround & Double Runs):** To fix this, a manual, synchronous call to `onEffectRunStateChange()` was added to the `FunctionalBase` constructor. This solved the timing issue for nested components but introduced a new problem: a "double run". The logic would execute once via the manual call and then a second time via the natural (but now redundant) subscription event, causing unnecessary processing.

## Solution

The problem was solved by enhancing the `Effect` class to handle this timing requirement gracefully, removing the need for workarounds in `FunctionalBase`.

1.  **Enhanced `Effect` Constructor:** The `Effect` constructor in `src/core/Effect.mjs` was modified to accept an optional third parameter, `subscriber`.

2.  **Pre-emptive Subscription:** If a `subscriber` object is passed during instantiation, the `Effect` class now immediately subscribes the handler to its `isRunning` config. This happens *before* the effect's `fn` is assigned and the first synchronous run is triggered.

3.  **Simplified `FunctionalBase`:**
    *   The `FunctionalBase` constructor in `src/functional/component/Base.mjs` was updated to pass its `onEffectRunStateChange` handler directly to the `Effect` constructor.
    *   The manual `subscribe()` call and the manual `onEffectRunStateChange()` trigger were both removed.
    *   A similar manual trigger inside `processVdomForComponents` for nested functional components was also removed.

This architectural change ensures that the VDOM processing logic is subscribed before the first run, guaranteeing that it executes exactly once and at the correct synchronous point in the component lifecycle. This fixes the initial render issue for all use cases without causing double runs.

## Timeline

- 2025-07-16T11:29:11Z @tobiu assigned to @tobiu
- 2025-07-16T11:29:13Z @tobiu added the `enhancement` label
- 2025-07-16T11:29:13Z @tobiu added parent issue #6992
- 2025-07-16T11:30:30Z @tobiu referenced in commit `8ac9b78` - "Improve Functional Component Initial Render Timing #7074"
- 2025-07-16T11:30:39Z @tobiu closed this issue

