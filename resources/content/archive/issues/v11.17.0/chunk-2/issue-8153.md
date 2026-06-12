---
id: 8153
title: 'Architecture: Propagate windowId to StateProviders and Controllers'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-21T16:09:18Z'
updatedAt: '2025-12-21T16:13:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8153'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-21T16:13:13Z'
---
# Architecture: Propagate windowId to StateProviders and Controllers

This task ensures that `windowId` is consistently propagated from `Neo.component.Abstract` to its associated `state.Provider` and `controller.Component` instances.

**Requirements:**
1.  **Neo.state.Provider**:
    *   Add a `windowId` config (default `null`). It does **not** need to be reactive, as `controller.Component` already has it as a non-reactive config.

2.  **Neo.component.Abstract**:
    *   Update `afterSetWindowId(value, oldValue)`:
        *   If `value` is defined, propagate it to `this.controller.windowId` (if the controller exists).
        *   If `value` is defined, propagate it to `this.stateProvider.windowId` (if the state provider exists).
    *   Update `beforeSetStateProvider(value, oldValue)`:
        *   Include `windowId: this.windowId` in the default values object passed to `ClassSystemUtil.beforeSetInstance` when creating the state provider instance.

## Timeline

- 2025-12-21T16:09:20Z @tobiu added the `enhancement` label
- 2025-12-21T16:09:20Z @tobiu added the `ai` label
- 2025-12-21T16:09:20Z @tobiu added the `architecture` label
- 2025-12-21T16:09:38Z @tobiu assigned to @tobiu
- 2025-12-21T16:12:58Z @tobiu referenced in commit `0d2eda6` - "#8153 Propagate windowId to StateProviders and Controllers"
### @tobiu - 2025-12-21T16:13:12Z

Implemented windowId propagation to state.Provider and controller.Component.
- Added non-reactive windowId config to state.Provider
- Updated component.Abstract to propagate windowId changes
- Updated component.Abstract to pass windowId during state provider creation
- Fixed JSDoc type for controller.Component.windowId

- 2025-12-21T16:13:13Z @tobiu closed this issue

