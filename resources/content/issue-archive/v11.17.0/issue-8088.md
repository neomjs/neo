---
id: 8088
title: Fix DOM event mapping for components with wrapper nodes
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-11T13:37:46Z'
updatedAt: '2025-12-11T13:39:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8088'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-11T13:39:03Z'
---
# Fix DOM event mapping for components with wrapper nodes

## Problem
DOM events on components with wrapper nodes (e.g., `Grid.Body` wrapped in a div) were failing to trigger listeners. 

The root cause was a mismatch between storage and lookup:
1. **Registration:** `DomEvent.register` was storing listeners under the physical wrapper ID (e.g., `#neo-grid-body-1__wrapper`).
2. **Firing:** `DomEvent.fire` calculates the bubbling path using `Component.getParentPath`, which returns a logical component tree (e.g., `['neo-grid-body-1', 'neo-grid-container-1', ...]`).

Because `fire` looks up listeners using the logical component ID, it never found the listeners registered under the wrapper ID.

## Solution
Updated `Neo.manager.DomEvent#register` to prioritize the Logical Component ID (`ownerId`) for storage.

- When registering a listener, if `config.ownerId` is present, it is used as the key in the `items` map, replacing the physical node ID.
- The physical node ID is still preserved in `listenerConfig.vnodeId` to ensure `verifyDelegationPath` continues to work correctly for event delegation.
- This ensures that `fire`, which walks the logical component tree, correctly finds listeners even if they are physically attached to a wrapper node.

## Changes
- Refactored `src/manager/DomEvent.mjs` `register()` to resolve the storage ID at the start of the method.

## Timeline

- 2025-12-11T13:37:47Z @tobiu added the `bug` label
- 2025-12-11T13:37:47Z @tobiu added the `ai` label
- 2025-12-11T13:38:01Z @tobiu assigned to @tobiu
- 2025-12-11T13:38:42Z @tobiu referenced in commit `bce961a` - "Fix DOM event mapping for components with wrapper nodes #8088"
- 2025-12-11T13:39:03Z @tobiu closed this issue
- 2025-12-11T14:23:11Z @tobiu cross-referenced by #8089

