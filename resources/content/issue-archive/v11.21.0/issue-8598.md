---
id: 8598
title: Refine Chimera safeguard in VDom.syncVdomState
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T13:59:23Z'
updatedAt: '2026-01-13T14:08:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8598'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T14:08:04Z'
---
# Refine Chimera safeguard in VDom.syncVdomState

Currently, `VDom.syncVdomState` aborts completely if the root node tags mismatch (e.g. `div` vs `ul`).
This prevents child nodes from synchronizing their IDs/state, leading to unnecessary DOM destruction and recreation when a wrapper tag changes.

The fix is to refine the safeguard:
1. Skip property synchronization (ID, scrollTop) for the mismatched node itself.
2. Continue recursion to attempt synchronization of child nodes (which will have their own tag checks).

## Timeline

- 2026-01-13T13:59:24Z @tobiu added the `enhancement` label
- 2026-01-13T13:59:24Z @tobiu added the `ai` label
- 2026-01-13T13:59:24Z @tobiu added the `core` label
- 2026-01-13T14:03:09Z @tobiu referenced in commit `ffb9f5c` - "enhancement: Refine Chimera safeguard in VDom.syncVdomState (#8598)

Changed syncVdomState to continue recursing into children even if the
root tags mismatch. This ensures child nodes can synchronize their IDs
(and thus be preserved/moved) when a parent tag is changed (e.g. div->ul).
Property synchronization (ID, scroll) is skipped for the mismatched node itself
to prevent 'Chimera' corruption."
- 2026-01-13T14:03:18Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-13T14:03:25Z

**Input from Gemini 3 Pro:**

> ✦ I have refined the safeguard in `VDom.syncVdomState`.
> It no longer aborts completely on tag mismatch. Instead:
> 1. It skips syncing ID/Scroll for the mismatched node (preventing Chimera on the parent).
> 2. It continues to recurse into children, allowing them to sync their IDs if their tags match.
> 
> This enables child node preservation (moving) when a parent tag changes. Changes pushed to `dev`.

- 2026-01-13T14:06:51Z @tobiu referenced in commit `0725b71` - "enhancement: Preserve scroll state during tag name changes (#8598)

1. Updated src/util/VDom.mjs to synchronize scrollTop/Left even when
   tags mismatch (moved outside the Chimera safeguard).
2. Updated src/main/DeltaUpdates.mjs to copy scrollTop/Left from the
   old node to the new clone during changeNodeName."
### @tobiu - 2026-01-13T14:07:43Z

**Input from Gemini 3 Pro:**

> ✦ I have expanded the scope of this ticket to include **Scroll State Preservation during Tag Changes**.
> 
> Originally, `VDom.syncVdomState` prevented any state synchronization if a tag mismatch was detected to avoid "Chimera" node corruption (e.g., a `ul` receiving a `li` ID). However, this had the side effect of also preventing scroll state synchronization (`scrollTop`, `scrollLeft`), causing scroll jumps when a container's tag was changed (e.g., `div` -> `section`).
> 
> **Updates:**
> 
> 1.  **`src/util/VDom.mjs`**:
>     *   Refined the safeguard: I moved the scroll synchronization logic **outside** the `!tagMismatch` block.
>     *   **Result:** The worker/VDOM now correctly captures and preserves the scroll position from the old VNode even if the new VDOM has a different tag name. The ID synchronization remains protected inside the safeguard to prevent Chimera corruption.
> 
> 2.  **`src/main/DeltaUpdates.mjs`**:
>     *   Updated `changeNodeName` to explicitly copy `scrollTop` and `scrollLeft` from the old DOM node to the new clone before replacement.
>     *   **Result:** The physical DOM replacement operation is now seamless regarding scroll position.
> 
> These changes ensure that semantic tag changes are non-destructive to both child structure and scroll state.

- 2026-01-13T14:08:04Z @tobiu closed this issue

