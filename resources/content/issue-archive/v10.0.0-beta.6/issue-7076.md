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
blockedBy: []
blocking: []
closedAt: '2025-07-18T14:49:54Z'
---
# Implement Asymmetric (Optimized) Vdom Update Depth

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

## Timeline

- 2025-07-16T13:28:17Z @tobiu assigned to @tobiu
- 2025-07-16T13:28:18Z @tobiu added the `enhancement` label
- 2025-07-16T18:22:54Z @tobiu referenced in commit `c7582b2` - "Implement Asymmetric (Optimized) Vdom Update Depth #7076 storing the epic inside the repo while under development"
- 2025-07-16T18:33:54Z @tobiu referenced in commit `f8aecea` - "#7076 manager.VDomUpdate WIP"
- 2025-07-16T19:44:37Z @tobiu referenced in commit `6fabe86` - "#7076 WIP"
- 2025-07-17T06:49:46Z @tobiu referenced in commit `c52140f` - "#7076 manager.VDomUpdate: getAdjustedUpdateDepth()"
- 2025-07-17T07:21:55Z @tobiu referenced in commit `d8a676c` - "#7076 manager.VDomUpdate: getAdjustedUpdateDepth()"
- 2025-07-17T07:32:18Z @tobiu referenced in commit `dbff692` - "#7076 manager.VDomUpdate: getAdjustedUpdateDepth()"
- 2025-07-17T07:57:17Z @tobiu referenced in commit `33eaaa3` - "#7076 functional.component.Base: updateDepth -1 when creating new child component instances"
- 2025-07-17T08:13:15Z @tobiu referenced in commit `f906ffe` - "#7076 functional.component.Base: onEffectRunStateChange() => depth check fix"
- 2025-07-17T09:18:52Z @tobiu referenced in commit `8712f40` - "#7076 WIP"
- 2025-07-17T09:54:29Z @tobiu referenced in commit `1af5091` - "#7076 first unit tests"
- 2025-07-17T10:13:02Z @tobiu referenced in commit `a99a1e4` - "#7076 WIP"
- 2025-07-17T10:56:14Z @tobiu referenced in commit `782e204` - "#7076 WIP"
- 2025-07-17T11:58:48Z @tobiu referenced in commit `ce48bd6` - "#7076 WIP"
- 2025-07-17T12:22:19Z @tobiu referenced in commit `e1ad229` - "#7076 more tests"
- 2025-07-17T14:38:03Z @tobiu referenced in commit `eca3543` - "#7076 WIP"
- 2025-07-17T14:46:48Z @tobiu referenced in commit `471f3ca` - "#7076 ticket update"
- 2025-07-17T15:06:52Z @tobiu referenced in commit `b29371b` - "#7076 mixin.VdomLifecycle: converted executeVdomUpdate() to async"
- 2025-07-17T15:29:39Z @tobiu referenced in commit `27724f3` - "#7076 WIP"
- 2025-07-17T15:35:23Z @tobiu referenced in commit `a3a56dd` - "#7076 adjustment for the vnode ctor => opts.id ??= opts.componentId;"
- 2025-07-17T15:51:47Z @tobiu referenced in commit `f966881` - "#7076 WIP"
- 2025-07-17T16:34:06Z @tobiu referenced in commit `6a87312` - "#7076 WIP"
- 2025-07-17T16:41:59Z @tobiu referenced in commit `989dba0` - "#7076 WIP"
- 2025-07-17T20:20:48Z @tobiu referenced in commit `edeebfd` - "#7076 WIP"
- 2025-07-17T21:59:35Z @tobiu referenced in commit `6dbafdf` - "#7076 WIP"
- 2025-07-17T22:51:57Z @tobiu referenced in commit `d70aa14` - "#7076 updateVdom() preventing all attempts before reaching isConstructed. container.Base: createItems() => preventing update() if not constructed."
- 2025-07-17T23:31:23Z @tobiu referenced in commit `bdbba03` - "#7076 manager.VDomUpdate WIP"
- 2025-07-17T23:31:23Z @tobiu referenced in commit `f470126` - "#7076 WIP"
- 2025-07-17T23:31:23Z @tobiu referenced in commit `4a42389` - "#7076 manager.VDomUpdate: getAdjustedUpdateDepth()"
- 2025-07-17T23:31:23Z @tobiu referenced in commit `fad0a5c` - "#7076 manager.VDomUpdate: getAdjustedUpdateDepth()"
- 2025-07-17T23:31:23Z @tobiu referenced in commit `de97019` - "#7076 manager.VDomUpdate: getAdjustedUpdateDepth()"
- 2025-07-17T23:31:23Z @tobiu referenced in commit `6b8bf1a` - "#7076 functional.component.Base: updateDepth -1 when creating new child component instances"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `8ade033` - "#7076 functional.component.Base: onEffectRunStateChange() => depth check fix"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `9a435d6` - "#7076 WIP"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `e0eaa16` - "#7076 first unit tests"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `b3168c3` - "#7076 WIP"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `154cfe8` - "#7076 WIP"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `8b78c30` - "#7076 WIP"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `8f53553` - "#7076 more tests"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `a4c7f81` - "#7076 WIP"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `a476d6c` - "#7076 ticket update"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `ca21668` - "#7076 mixin.VdomLifecycle: converted executeVdomUpdate() to async"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `0cde41d` - "#7076 WIP"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `ad20df3` - "#7076 adjustment for the vnode ctor => opts.id ??= opts.componentId;"
- 2025-07-17T23:31:24Z @tobiu referenced in commit `d3ca0aa` - "#7076 WIP"
- 2025-07-17T23:31:25Z @tobiu referenced in commit `19cb6c5` - "#7076 WIP"
- 2025-07-17T23:31:25Z @tobiu referenced in commit `0604d72` - "#7076 WIP"
- 2025-07-17T23:31:25Z @tobiu referenced in commit `08f5fcb` - "#7076 WIP"
- 2025-07-17T23:31:25Z @tobiu referenced in commit `cbe3731` - "#7076 WIP"

