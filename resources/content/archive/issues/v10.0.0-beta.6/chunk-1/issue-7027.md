---
id: 7027
title: 'Feature: Robust Synchronous Updates for Functional Components'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-12T18:23:38Z'
updatedAt: '2025-07-13T17:48:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7027'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-13T17:48:36Z'
---
# Feature: Robust Synchronous Updates for Functional Components

**Is your feature request related to a problem? Please describe.**
Previously, the reactivity system for functional components could lead to infinite loops or unpredictable behavior during VDOM updates due to unintended dependencies and synchronous re-triggering of effects.

**Describe the solution you'd like**
The `Neo.functional.component.Base` class now supports robust and stable synchronous updates. This has been achieved through a series of architectural improvements:

*   **Decoupled VDOM Generation and Application:** The `vdomEffect` now solely focuses on generating the new VDOM structure (`createVdom`), storing it temporarily. The application of this VDOM to the component's stable `vdom` object, and the subsequent triggering of `updateVdom()`, occurs in the `onEffectRunStateChange` handler.
*   **Controlled Dependency Tracking:** The `EffectManager.pause()` and `resume()` mechanism, utilized within hooks like `useConfig()`, prevents unintended reactive dependencies (e.g., on `ComponentManager.registry`) from being created during non-rendering-related operations.
*   **Robust Batch Processing:** The `EffectBatchManager.endBatch()` method now correctly handles effect execution by taking a snapshot of pending effects and clearing the queue *before* running them, preventing synchronous re-queuing and infinite loops within the batch processor.

These changes collectively ensure that functional components update reliably and efficiently in response to reactive config and state changes, without encountering call stack overflows.

**Describe alternatives you've considered**
(None considered, as this is the implemented solution.)

**Additional context**
This represents a significant milestone in the stability and predictability of functional components within Neo.mjs.

**Affected Files:**
*   `src/functional/component/Base.mjs`

## Timeline

- 2025-07-12T18:23:39Z @tobiu assigned to @tobiu
- 2025-07-12T18:23:39Z @tobiu added the `enhancement` label
- 2025-07-12T18:23:40Z @tobiu added parent issue #6992
- 2025-07-12T18:24:21Z @tobiu referenced in commit `4b12fb7` - "Feature: Robust Synchronous Updates for Functional Components #7027"
- 2025-07-13T17:48:36Z @tobiu closed this issue

