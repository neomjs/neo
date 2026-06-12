---
id: 7024
title: Refactor `Neo.core.Effect` to Use a Reactive `isRunning` State
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-12T14:48:36Z'
updatedAt: '2025-07-12T15:32:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7024'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-12T15:32:46Z'
---
# Refactor `Neo.core.Effect` to Use a Reactive `isRunning` State

**Summary:**
This ticket covers the refactoring of `Neo.core.Effect` to change its internal `isRunning` flag from a plain boolean to a reactive `Neo.core.Config` instance. This change was essential to break an infinite loop encountered in functional components, where an effect's execution was inadvertently creating a dependency on its own update cycle.

**Rationale:**
Functional components use a central `vdomEffect` to re-render when state changes. The initial implementation caused an infinite loop because the effect's execution triggered an update process (`updateVdom`), which in turn read a reactive property (`vnode`) that was set at the end of the update. This created a feedback loop: `effect -> update -> read vnode -> trigger effect`.

To break this loop, the component needed to apply the VDOM update *after* the effect had finished running, outside of its tracking scope. Making `Effect` a full `Observable` was deemed too heavyweight. The most minimalistic and elegant solution was to make only the `isRunning` property observable.

**Implementation Details:**
1.  The `isRunning` property in `Neo.core.Effect` was changed from a boolean to an instance of `Neo.core.Config`, initialized with `false`.
2.  The `run()` method was updated to use `isRunning.get()` for checks and `isRunning.set()` to update the state.
3.  This allows consumer classes, such as `Neo.functional.component.Base`, to `subscribe()` to the `isRunning` config and safely trigger actions (like applying VDOM updates) when the state changes from `true` to `false`, effectively decoupling the action from the effect's dependency tracking.

**Definition of Done:**
-   `Effect.isRunning` is an instance of `Neo.core.Config`.
-   The `run()` method correctly uses `get()` and `set()` on `isRunning`.
-   The change successfully enables consumers to observe the effect's execution state, resolving the infinite loop problem in functional components.

## Timeline

- 2025-07-12T14:48:36Z @tobiu assigned to @tobiu
- 2025-07-12T14:48:38Z @tobiu added the `enhancement` label
- 2025-07-12T14:49:00Z @tobiu referenced in commit `3090f97` - "Refactor Neo.core.Effect to Use a Reactive isRunning State #7024"
- 2025-07-12T15:32:46Z @tobiu closed this issue
- 2025-07-12T18:28:28Z @tobiu added parent issue #6992

