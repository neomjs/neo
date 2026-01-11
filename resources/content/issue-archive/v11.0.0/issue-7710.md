---
id: 7710
title: Refactor `vnodeInitialized` to a Reactive Config in `VdomLifecycle`
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-06T12:49:22Z'
updatedAt: '2025-11-06T12:50:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7710'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-06T12:50:13Z'
---
# Refactor `vnodeInitialized` to a Reactive Config in `VdomLifecycle`

The `vnodeInitialized` property was incorrectly defined as a non-reactive config in `Neo.component.Base` and manually managed with getters, setters, and event firing. This created an inconsistent and fragile implementation.

This refactoring corrected the issue by:
1.  Moving the definition of `vnodeInitialized` to the `VdomLifecycle` mixin, its logical owner.
2.  Converting it to a proper reactive config (`vnodeInitialized_`) with a trailing underscore.
3.  Adding an `afterSetVnodeInitialized` hook within the mixin to handle the `vnodeInitialized` event firing automatically.
4.  Removing the obsolete non-reactive config, getter, and setter from `Neo.component.Base`.
5.  Updating `onInitVnode()` and `syncVnodeTree()` to use the new reactive setter (`this.vnodeInitialized = true`) instead of manually manipulating the private property and firing events.

This change centralizes the logic, improves code clarity, and aligns the implementation with Neo.mjs best practices for reactive state management.

## Timeline

- 2025-11-06T12:49:23Z @tobiu added the `enhancement` label
- 2025-11-06T12:49:24Z @tobiu added the `ai` label
- 2025-11-06T12:49:24Z @tobiu added the `refactoring` label
- 2025-11-06T12:49:39Z @tobiu assigned to @tobiu
- 2025-11-06T12:50:04Z @tobiu referenced in commit `80863fe` - "Refactor vnodeInitialized to a Reactive Config in VdomLifecycle #7710"
- 2025-11-06T12:50:13Z @tobiu closed this issue

