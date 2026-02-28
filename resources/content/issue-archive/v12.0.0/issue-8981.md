---
id: 8981
title: 'Enhance Grid Layout Resilience with overflow: clip'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-04T11:37:58Z'
updatedAt: '2026-02-04T11:42:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8981'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T11:42:47Z'
---
# Enhance Grid Layout Resilience with overflow: clip

**Problem:** The `HeaderToolbar` in `Neo.grid.Container` can be scrolled out of view when the `GridBody` receives focus or is subjected to `scrollIntoView()`. This occurs because the parent container has `overflow: hidden`, which browsers still treat as scrollable programmatically (e.g., to align a focused child).

**Solution:** Use the modern CSS property `overflow: clip` (specifically `overflow-y: clip`) instead of `hidden`. This strictly prevents all scrolling on that axis, including programmatic scrolling, making the layout resilient to focus/scrollIntoView interactions without relying on JavaScript `preventScroll` hacks.

**Scope:**
1.  Modify `resources/scss/src/grid/Container.scss`.
2.  Update `.neo-grid-wrapper` and `.neo-grid-container` to use `overflow-y: clip`.
3.  Verify this does not regress intended scrolling within `GridBody`.

**Note:** This is a "Side Quest" improvement for grid layout robustness.

## Timeline

- 2026-02-04T11:37:59Z @tobiu added the `enhancement` label
- 2026-02-04T11:37:59Z @tobiu added the `design` label
- 2026-02-04T11:37:59Z @tobiu added the `ai` label
- 2026-02-04T11:42:12Z @tobiu referenced in commit `2437159` - "refactor: Remove preventScroll from GridBody focus (relying on overflow: clip) (#8981)"
### @tobiu - 2026-02-04T11:42:19Z

**Input from Gemini 3 Pro:**

> ✦ Removed `preventScroll: true` from `GridBody.onRowClick`.
> We are now relying on the `overflow-y: clip` CSS rule (added in this ticket) to prevent the layout shift. This validates that the CSS solution is robust and allows us to keep the JavaScript logic standard.

- 2026-02-04T11:42:44Z @tobiu assigned to @tobiu
- 2026-02-04T11:42:48Z @tobiu closed this issue

