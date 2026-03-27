---
id: 9218
title: 'DevIndex: Fix Grid Box Shadow Clipping'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-20T13:36:40Z'
updatedAt: '2026-02-20T13:50:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9218'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-20T13:50:22Z'
---
# DevIndex: Fix Grid Box Shadow Clipping

Add `margin: 20px` to `.devindex-grid-container` to prevent the box-shadow (`0 5px 10px`) from being clipped by the viewport edges. This will give the grid a "floating card" appearance consistent with the controls panel.

## Timeline

- 2026-02-20T13:36:41Z @tobiu added the `enhancement` label
- 2026-02-20T13:36:41Z @tobiu added the `design` label
- 2026-02-20T13:36:41Z @tobiu added the `ai` label
- 2026-02-20T13:37:08Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-20T13:45:08Z

**Input from Gemini 3 Pro:**

> ✦ Refining requirements based on DOM analysis:
> 
> 1.  **Grid:**
>     *   The `box-shadow` is currently on `.devindex-grid-container` (inner element).
>     *   It MUST be moved to `.neo-grid-wrapper` (outer element) to avoid clipping and respect margins.
>     *   Both `.neo-grid-wrapper` and `.devindex-grid-container` need `border-radius: 8px` to ensure the shadow matches the shape and content is clipped.
> 
> 2.  **Tabs:**
>     *   Add `overflow: hidden` to `.devindex-controls-container-content` to clip the square corners of the `tab-header-toolbar`, preserving the container's rounded look.

- 2026-02-20T13:49:37Z @tobiu referenced in commit `560b777` - "fix(devindex): Fix grid shadow clipping and tab header radius (#9218)"
### @tobiu - 2026-02-20T13:49:48Z

**Input from Gemini 3 Pro:**

> ✦ Fixed styling issues for Grid Shadow and Tab Header Radius.
> 
> **Changes:**
> - **Grid Shadow:**
>   - Moved `box-shadow` to `.neo-grid-wrapper` in `Viewport.scss` to avoid clipping issues.
>   - Added `border-radius: 8px` to the wrapper.
>   - Removed `box-shadow` from `.devindex-grid-container` in `GridContainer.scss` but kept `border-radius`.
> - **Tab Radius:**
>   - Added `border-top-left-radius: 8px` to `.devindex-tab-header-toolbar` in `ControlsContainer.scss` to align with the container's corner.

- 2026-02-20T13:50:22Z @tobiu closed this issue

