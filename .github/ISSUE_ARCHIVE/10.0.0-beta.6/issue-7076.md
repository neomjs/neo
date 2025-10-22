---
id: 7076
title: Implement Asymmetric (Optimized) Vdom Update Depth
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-16T13:28:17Z'
updatedAt: '2025-07-18T14:49:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7076'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-18T14:49:54Z'
---
# Implement Asymmetric (Optimized) Vdom Update Depth

**Reported by:** @tobiu on 2025-07-16

## Problem

The framework's VDOM update mechanism is not fully optimized. It suffers from two key issues:

1.  **Depth-Blind Updates:** The current `ComponentManager.getVdomTree()` method does not honor the `updateDepth` of child components, which can lead to incomplete VDOM payloads and broken renders.
2.  **Missing Collision Detection:** The `VdomLifecycle.updateVdom()` method does not check for update collisions with child components that are part of the current update's scope, creating a potential race condition.

## Solution

This ticket proposes a comprehensive enhancement to the VDOM update lifecycle to create the most efficient and robust update payloads possible.

### 1. Asymmetric VDOM Serialization

The `ComponentManager.getVdomTree()` method will be refactored. Instead of working with a single, monolithic `depth` counter, it will recursively build the VDOM tree while honoring the specific `updateDepth` of **each individual component** it encounters. This will result in an optimally sized, asymmetric VDOM tree where each branch is only as deep as it needs to be.

### 2. Enhanced Collision Detection

A new `isChildUpdating()` method will be added to `VdomLifecycle.mjs`. This method will be called from `updateVdom()` and will be responsible for:
- Recursively traversing all child components that fall within the scope of the upcoming update.
- Checking the `isVdomUpdating` flag on each of these children.
- If a collision is found, the parent's update will be postponed by setting `needsVdomUpdate` to `true` and preserving the `resolve` callback, preventing race conditions.

### 3. Code Clarity Improvements

As part of this refactoring, the method `needsParentUpdate()` in `VdomLifecycle.mjs` will be renamed to **`mergeIntoParentUpdate()`**. This more accurately describes its function of merging a component's update callback into a pending parent update.

This holistic approach will solve the existing correctness bugs while simultaneously implementing a highly optimized, asymmetric update strategy, making the framework's rendering core more efficient and robust.

