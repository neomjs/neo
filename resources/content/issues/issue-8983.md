---
id: 8983
title: Fix Grid Scrollbar Position and DragScroll ID Mismatch
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2026-02-04T12:20:33Z'
updatedAt: '2026-02-04T12:54:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8983'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T12:54:10Z'
---
# Fix Grid Scrollbar Position and DragScroll ID Mismatch

**Problem:**
1.  **Vertical Scrollbar moves horizontally:** The vertical scrollbar scrolls with the content instead of staying pinned.
2.  **GridDragScroll Regression:** Horizontal drag scrolling is broken because `ScrollManager` passes the Component ID (`id`) instead of the rendered DOM ID (`id__wrapper`) to the `GridDragScroll` addon.

**Fix:**
1.  **Revert to `overflow-y: hidden`:** We changed `resources/scss/src/grid/Container.scss` from `overflow-y: clip` back to `overflow-y: hidden` on the inner `.neo-grid-container`.
    *   **Rationale:** `clip` forces the parent wrapper (which has `overflow-x: auto`) to handle the scrolling. Since the vertical scrollbar is an absolute child of that wrapper, it scrolls away with the content. `hidden` creates a new Block Formatting Context (BFC) / Scroll Container on the inner element, trapping the wide content inside. This means the inner element scrolls, while the wrapper (and the scrollbar pinned to it) stays static.
2.  **Focus Scroll Prevention:** The reason we originally moved to `clip` was to prevent the browser from scrolling the grid body into view when focused (which sometimes pushed headers out). We solved this properly in `src/grid/Body.mjs` by passing `{preventScroll: true}` to the `focus()` method in `onRowClick`.

## Timeline

- 2026-02-04T12:20:35Z @tobiu added the `bug` label
- 2026-02-04T12:53:33Z @tobiu referenced in commit `a92ab46` - "fix: Restore Grid Scrollbar position and diagonal scrolling (#8983)"
### @tobiu - 2026-02-04T12:53:44Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved this issue.
> 
> **Changes:**
> 1.  **Reverted SCSS:** Changed `resources/scss/src/grid/Container.scss` back to `overflow-y: hidden`. This restores the correct scrolling behavior where the inner container scrolls while the wrapper (and the pinned scrollbar) remains static.
> 2.  **Fixed Focus Logic:** Updated `src/grid/Body.mjs` to use `this.focus(this.vdom.id, false, true)` in `onRowClick`. The `true` argument enables `preventScroll`, ensuring that focusing a row doesn't trigger unwanted browser scrolling behavior, which was the original reason for trying `overflow-y: clip`.
> 3.  **Note on DragScroll:** No changes were made to `ScrollManager.mjs` or `GridDragScroll.mjs`. The regression in drag scrolling was a side effect of the broken overflow behavior. Restoring the correct CSS fixed both issues.
> 
> I have pushed the changes to the feature branch.

- 2026-02-04T12:53:51Z @tobiu assigned to @tobiu
- 2026-02-04T12:54:11Z @tobiu closed this issue
### @tobiu - 2026-02-04T12:54:53Z

relates to #8981 


