---
id: 8906
title: Preserve Functional Component Scroll State with Early ID Generation
state: OPEN
labels:
  - bug
  - ai
  - core
assignees: []
createdAt: '2026-01-29T14:04:10Z'
updatedAt: '2026-01-29T14:04:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8906'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

