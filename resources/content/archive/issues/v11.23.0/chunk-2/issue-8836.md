---
id: 8836
title: 'Architecture: Optimize `vdom.Helper.updateBatch` Response Payload'
state: CLOSED
labels:
  - ai
  - architecture
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T21:00:14Z'
updatedAt: '2026-01-20T22:06:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8836'
author: tobiu
commentsCount: 1
parentIssue: 8834
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T22:06:07Z'
---
# Architecture: Optimize `vdom.Helper.updateBatch` Response Payload

Currently, `vdom.Helper.updateBatch` returns both `deltas` (DOM operations) and `vnodes` (new VNode state) in the same response message. Since this message is forwarded from Vdom Worker -> Main -> App, the large `vnodes` payload traverses the Main thread unnecessarily, and the `deltas` payload traverses to the App thread unnecessarily.

**Goal:**
Split the response flow to avoid doubling the payload size.

**Proposed Strategy:**
1.  **Vdom -> Main:** Send `deltas` only. Main consumes them.
2.  **Vdom -> App:** Send `vnodes` (results) directly? Or have Main strip `deltas` before forwarding?
3.  Alternatively, implement `VDomUtil.applyDeltas(vnode, deltas)` on the App side to reconstruct state from deltas, eliminating the need to send `vnodes` entirely.

**Tasks:**
-   Investigate feasibility of `applyDeltas` for VNode state.
-   Implement payload splitting or reconstruction.

## Timeline

- 2026-01-20T21:00:16Z @tobiu added the `ai` label
- 2026-01-20T21:00:16Z @tobiu added the `architecture` label
- 2026-01-20T21:00:16Z @tobiu added the `performance` label
- 2026-01-20T21:00:16Z @tobiu added the `core` label
- 2026-01-20T21:00:23Z @tobiu added parent issue #8834
- 2026-01-20T21:01:44Z @tobiu referenced in commit `8525ee0` - "refactor: Update vdom.Helper.updateBatch to return vnodes Map (#8836)

- Changed updateBatch return to { vnodes: { [id]: vnode } }
- Removed 'results' array from return
- Updated VdomLifecycle.executeVdomUpdate to iterate vnodes map
- Verified tests pass"
- 2026-01-20T21:01:54Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-20T21:01:56Z

**Input from Gemini 3 Pro:**

> ✦ Completed refactoring of `updateBatch` return signature.
> 
> - Now returns `{ vnodes: { [id]: vnode } }` instead of an array.
> - Updated `executeVdomUpdate` to consume the map.
> - This prepares for further payload optimizations (e.g. splitting deltas/results).
> - Verified tests pass.
> - Pushed to `epic-8834`.

- 2026-01-20T21:13:02Z @tobiu cross-referenced by #8837
- 2026-01-20T22:06:07Z @tobiu closed this issue

