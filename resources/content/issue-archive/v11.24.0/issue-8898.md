---
id: 8898
title: Fix VDOM ID Corruption during Component Recycling (Structural Shifts)
state: CLOSED
labels:
  - bug
  - core
assignees: []
createdAt: '2026-01-27T21:18:28Z'
updatedAt: '2026-01-27T21:36:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8898'
author: tobiu
commentsCount: 2
parentIssue: 8891
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-27T21:21:32Z'
---
# Fix VDOM ID Corruption during Component Recycling (Structural Shifts)

**Problem:**
During rapid updates or complex component recycling (like Buffered Grid scrolling), `Neo.util.VDom.syncVdomState` can corrupt VDOM IDs. This happens because the function synchronizes IDs from the Worker (VNode) to the App (VDOM) using an **index-based loop**, assuming structural identity.

When components are recycled (e.g., Row A moves to Row B's position), the App's VDOM structure shifts (New Order), but the Worker's response might reflect the Old Order. `syncVdomState` blindly maps IDs from the Old Order to the New Order. While top-level IDs (like the Row itself) are protected by an existence check, the function **descends into the children**, corrupting the internal IDs of stable components (like Buttons inside cells). This leads to "Node Stealing" and duplicate DOM nodes.

**Solution:**
Modify `src/util/VDom.mjs` to **abort child synchronization** if the parent IDs mismatch.
```javascript
if (vnode.id && vdom.id && vnode.id !== vdom.id) {
    return; // Stop recursion
}
```
This ensures that IDs are only synced into a subtree if the root of that subtree matches the Worker's view, preventing cross-contamination during structural shifts.

**Impact:**
Fixes node duplication and "Recursive Move" anomalies in high-performance grids and other recycling views.

## Timeline

- 2026-01-27T21:18:29Z @tobiu added the `bug` label
- 2026-01-27T21:18:30Z @tobiu added the `core` label
- 2026-01-27T21:19:10Z @tobiu cross-referenced by #8893
- 2026-01-27T21:20:42Z @tobiu referenced in commit `4f223a7` - "Fix VDOM ID Corruption during Component Recycling (Structural Shifts) #8898"
- 2026-01-27T21:20:53Z @tobiu added parent issue #8891
### @tobiu - 2026-01-27T21:21:16Z

**Input from Gemini 3 Pro:**

> ✦ This issue was identified during the investigation of #8893.
> 
> **Resolution:**
> The fix was implemented in `src/util/VDom.mjs` to abort child synchronization when parent IDs mismatch.
> Regression tests were added in `test/playwright/unit/vdom/SyncVdomIds.spec.mjs`.
> 
> Fixed in commit referencing #8893. Closing as resolved.

- 2026-01-27T21:21:33Z @tobiu closed this issue
- 2026-01-27T21:36:14Z @tobiu referenced in commit `cfd7dde` - "fix: Add length mismatch guard to syncVdomState to prevent ID corruption #8898"
### @tobiu - 2026-01-27T21:36:20Z

**Input from Gemini 3 Pro:**

> ✦ ### Additional Fix: Length Mismatch Guard
> 
> Further analysis revealed a second corruption vector:
> **Scenario:** A stable component (Parent ID matches) updates its structure asynchronously (e.g., adds a child) while an older update is in-flight.
> - **Worker (Old):** `Parent` has 1 child (`Text`).
> - **App (New):** `Parent` has 2 children (`Icon`, `Text`).
> - **Sync:**
>     - Parent IDs match. Recursion proceeds.
>     - Index 0: `Text` (Worker) vs `Icon` (App).
>     - `Icon` gets `Text` ID. **Corruption.**
> 
> **Solution:**
> Added a **Length Mismatch Guard** to `src/util/VDom.mjs`:
> ```javascript
> if (vnode.childNodes && vnode.childNodes.length !== len) {
>     return;
> }
> ```
> This ensures that `syncVdomState` aborts if the child count differs, protecting against structural desynchronization even when the parent ID is stable.
> 
> **Impact:**
> - **Corruption Prevention:** Prevents stable nodes from stealing IDs from their siblings during structural shifts.
> - **Transient State:** The new/shifted nodes will temporarily have `null` IDs (as verified in tests). This forces the VDOM Worker to treat them as insertions or match them by structure in the *next* update cycle, which generates valid new IDs. This is safer than applying incorrect IDs.
> 
> **Verification:**
> Updated `test/playwright/unit/vdom/SyncVdomIds.spec.mjs` with a test case for this specific scenario. All tests pass.


