---
id: 8906
title: Preserve Functional Component Scroll State with Early ID Generation
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-29T14:04:10Z'
updatedAt: '2026-01-29T15:06:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8906'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-29T15:06:42Z'
---
# Preserve Functional Component Scroll State with Early ID Generation

**Problem:**
Functional Components recreate their VDOM on every update. This wiped transient state stored on the VDOM object, such as `scrollTop` captured from the Main Thread via `onScrollCapture`. When `VDom.syncVdomState` ran, it sometimes overwrote valid scroll state with stale VNode state. Additionally, late ID generation caused state preservation logic to fail for child nodes because they lacked IDs during processing.

**Solution:**
1.  **Early VDOM Update & Root ID Assignment:** In `continueUpdateWithVdom`, `me.vdom` is now updated with the new `parsedVdom` immediately. The root is then identified using `me.getVdomRoot()` and the component ID is assigned **unconditionally** and **before** ID generation. This ensures `generateIds` uses the correct scope prefix.
2.  **State Preservation with O(1) Lookup:** `processVdomForComponents` now accepts a pre-calculated `vnodeMap` (flattened from `me.vnode`). It uses this map to preserve `scrollTop`/`scrollLeft` from the persistent VNode tree to the new VDOM tree efficiently.
3.  **Refactoring:** The method `continueUpdateWithVdom` was refactored to support this new flow, removing redundant logic.

**Verification:**
- New unit test `test/playwright/unit/functional/ScrollState.spec.mjs` verifies state preservation for root and child nodes.
- Regression tests `IdGeneration.spec.mjs` and `Button.spec.mjs` passed.

## Timeline

- 2026-01-29T14:04:11Z @tobiu added the `bug` label
- 2026-01-29T14:04:11Z @tobiu added the `ai` label
- 2026-01-29T14:04:11Z @tobiu added the `core` label
- 2026-01-29T15:03:56Z @tobiu referenced in commit `4768c03` - "fix: Preserve Functional Component Scroll State with Early ID Generation (#8906)"
- 2026-01-29T15:05:21Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-29T15:05:24Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix for preserving functional component scroll state.
> 
> **Changes:**
> 1.  **Early VDOM Update:** `continueUpdateWithVdom` now updates `me.vdom` with the parsed VDOM *before* identifying the root and assigning IDs.
> 2.  **State Preservation:** `processVdomForComponents` now accepts a `vnodeMap` (O(1) lookup) to efficiently copy `scrollTop` and `scrollLeft` from the persistent VNode to the new VDOM.
> 3.  **VdomLifecycle Hardening:** Added a null check for `me.vnode` in `syncVnodeTree` to prevent crashes during initialization sequences where the vnode might not yet exist.
> 4.  **Tests:** Added `test/playwright/unit/functional/ScrollState.spec.mjs` to verify state preservation for both root and child nodes. Verified against existing ID generation and Button tests.
> 
> The solution ensures that transient state like scroll position, which is captured from the main thread into the App Worker's VNode tree, is not lost when a Functional Component regenerates its VDOM structure.

- 2026-01-29T15:06:43Z @tobiu closed this issue

