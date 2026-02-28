---
id: 9017
title: Refactor Grid.Body to extend Component.Base and use internal Row Pool
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2026-02-06T17:39:35Z'
updatedAt: '2026-02-06T17:57:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9017'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-06T17:57:09Z'
---
# Refactor Grid.Body to extend Component.Base and use internal Row Pool

**Objective:**
Revert `Neo.grid.Body` inheritance from `Neo.container.Base` to `Neo.component.Base`. The new "Fixed-DOM-Order" Row Pooling strategy renders the Container API (`add`, `remove`, `layout`) unsafe and redundant.

**Changes Required:**

1.  **Inheritance:**
    - Change `src/grid/Body.mjs` to extend `Neo.component.Base`.

2.  **Row Pool Management:**
    - Replace the `items` config with a private/protected class field (e.g., `items = []`) to store `Neo.grid.Row` instances.
    - Update `createRowPool` to instantiate rows with:
        ```javascript
        parentId: me.id,
        appName : me.appName,
        windowId: me.windowId,
        theme   : me.theme
        ```

3.  **Lifecycle Management:**
    - Implement `destroy()` to manually iterate and destroy row instances in `this.items`.

4.  **Config Propagation (Container Behavior Mimicry):**
    - Implement `afterSetAppName`, `afterSetMounted`, `afterSetTheme`, and `afterSetWindowId`.
    - These methods must iterate over `this.items` and update the corresponding properties on the row instances, ensuring correct state propagation (theme changes, window moves, etc.).

5.  **Verification:**
    - Ensure `Neo.manager.Component` methods (`down`, `query`) still function correctly by relying on the `parentId` link.

**Why:**
To enforce API safety by hiding inapplicable container methods and to remove the overhead of unused layout/container logic in the highly performance-sensitive grid body.

## Timeline

- 2026-02-06T17:39:36Z @tobiu added the `ai` label
- 2026-02-06T17:39:36Z @tobiu added the `refactoring` label
- 2026-02-06T17:39:37Z @tobiu added the `architecture` label
- 2026-02-06T17:56:39Z @tobiu referenced in commit `12fa73c` - "refactor: Upgrade Grid.Body to use internal Row Pooling (Component vs Container) (#9017)"
### @tobiu - 2026-02-06T17:56:45Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `Neo.grid.Body` to extend `Neo.component.Base` instead of `Neo.container.Base`.
> This enforces API safety by hiding inapplicable container methods (`add`, `remove`, `layout`) and removes the overhead of unused logic.
> 
> **Key Changes:**
> 1.  **Inheritance:** Changed parent class to `Neo.component.Base`.
> 2.  **Row Pool:** Replaced `items` config with a protected `items` array.
> 3.  **Lifecycle:** Implemented `destroy()` to manually destroy row instances.
> 4.  **Propagation:** Implemented `afterSetAppName`, `afterSetTheme`, `afterSetWindowId`, and `afterSetMounted` to manually propagate state to the row pool.
> 5.  **Creation:** Updated `createRowPool` to manually instantiate rows with full context.
> 6.  **Documentation:** Updated JSDoc to reflect the architectural shift and the reasoning ("Row Manager" role).
> 
> I verified the changes against the demos, and no regressions were found. The code has been pushed to `dev`.

- 2026-02-06T17:56:53Z @tobiu assigned to @tobiu
- 2026-02-06T17:57:10Z @tobiu closed this issue
- 2026-02-06T18:09:21Z @tobiu cross-referenced by #9018
- 2026-02-06T18:14:53Z @tobiu cross-referenced by #9019

