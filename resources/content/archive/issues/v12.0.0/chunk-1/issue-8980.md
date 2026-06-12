---
id: 8980
title: Fix Grid Keyboard Navigation and Focus Layout Shift
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-04T11:31:12Z'
updatedAt: '2026-02-04T11:32:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8980'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T11:32:03Z'
---
# Fix Grid Keyboard Navigation and Focus Layout Shift

**Problem:** Keyboard navigation in the grid is broken. Selecting a row or cell no longer triggers focus on the grid body wrapper, preventing `KeyNavigation` from capturing arrow key events. Additionally, focusing the body wrapper manually causes a layout shift where the header toolbar is scrolled out of view.

**Scope:**
1.  **Focus Restoration:** Ensure `GridBody` receives focus on row/cell clicks.
2.  **Layout Stability:** Implement `preventScroll` support for `focus()` to stop the browser from scrolling the parent container.

**Changes Required:**
-   `src/main/DomAccess.mjs`: Update `focus` to support `preventScroll`.
-   `src/component/Base.mjs`: Update `focus` signature to pass `preventScroll`.
-   `src/grid/Body.mjs`: Call `this.focus(this.vdom.id, false, true)` in `onRowClick`.

## Timeline

- 2026-02-04T11:31:14Z @tobiu added the `bug` label
- 2026-02-04T11:31:14Z @tobiu added the `ai` label
- 2026-02-04T11:31:14Z @tobiu added the `refactoring` label
- 2026-02-04T11:31:39Z @tobiu referenced in commit `830bbb5` - "fix: Restore Grid keyboard navigation and prevent layout shift on focus (#8980)"
### @tobiu - 2026-02-04T11:31:45Z

**Input from Gemini 3 Pro:**

> ✦ **Fixed Grid Keyboard Navigation & Layout Stability**
> 
> 1.  **Focus Restoration:**
>     -   Updated `GridBody.onRowClick` to explicitly call `this.focus(this.vdom.id)`. This ensures the grid wrapper (which has `tabIndex="-1"`) receives focus upon interaction, re-enabling keyboard navigation events.
> 
> 2.  **Layout Shift Prevention:**
>     -   Identified that focusing the grid body caused the browser to scroll the parent `GridContainer`, pushing the `HeaderToolbar` out of view.
>     -   Updated `Neo.main.DomAccess.focus` to support the `{preventScroll: true}` option for the native `HTMLElement.focus()` method.
>     -   Updated `Neo.component.Base.focus` to accept and pass the `preventScroll` argument.
>     -   Applied `preventScroll: true` to the `GridBody` focus call.
> 
> This resolves the regression where row selection broke arrow-key navigation and caused visual jarring.

- 2026-02-04T11:31:48Z @tobiu assigned to @tobiu
- 2026-02-04T11:32:03Z @tobiu closed this issue

