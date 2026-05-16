---
id: 8912
title: Enhance Mouse Event Data and Refine Grid Drag Logic
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-30T11:29:49Z'
updatedAt: '2026-01-30T11:39:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8912'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-30T11:39:42Z'
---
# Enhance Mouse Event Data and Refine Grid Drag Logic

To robustly handle drag-to-scroll interactions, especially distinguishing between left-click drags and other mouse interactions, we need access to the standard `event.button` and `event.buttons` properties in the App Worker. Currently, `DomEvents` does not extract these.

**Requirements:**
1.  Update `getMouseEventData` in `src/main/DomEvents.mjs` to include `button` and `buttons`.
2.  Update `onMouseDown` in `ScrollManager.mjs` to check `data.button === 0`.
3.  Update `onMouseMove` in `ScrollManager.mjs` to check `data.buttons === 1`.
4.  Remove `mouseleave` handling in `ScrollManager.mjs` to rely on `buttons` state for drag continuity.

## Timeline

- 2026-01-30T11:29:50Z @tobiu added the `enhancement` label
- 2026-01-30T11:29:50Z @tobiu added the `ai` label
### @tobiu - 2026-01-30T11:39:07Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the refinements for robust mouse drag scrolling in `src/main/DomEvents.mjs` and `src/grid/ScrollManager.mjs`.
> 
> **Changes:**
> 1.  **Event Data Enhancement:** Updated `getMouseEventData` in `src/main/DomEvents.mjs` to extract and pass `button` and `buttons` properties.
> 2.  **Logic Refinement:** Updated `ScrollManager.mjs`:
>     -   `onMouseDown`: Added check for `data.button === 0` (left click only).
>     -   `onMouseMove`: Added check for `data.buttons === 1` (left button held).
>     -   `onMouseLeave`: Removed the handler (and listener registration) to allow drag continuity when cursor leaves the element (relying on `buttons` state for validity).
> 
> This ensures drag-scrolling only engages on left-click and robustly handles cases where the mouse momentarily leaves the grid area.
> 
> Closing the ticket.

- 2026-01-30T11:39:23Z @tobiu assigned to @tobiu
- 2026-01-30T11:39:42Z @tobiu closed this issue
- 2026-01-30T11:39:48Z @tobiu referenced in commit `b7bbcb6` - "enhancement: Enhance Mouse Event Data and Refine Grid Drag Logic (#8912)"

