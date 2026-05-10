---
id: 8973
title: 'fix: Component Columns disappear after horizontal scroll due to stale mounted state (#8964)'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-03T21:17:05Z'
updatedAt: '2026-02-03T21:30:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8973'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T21:29:12Z'
---
# fix: Component Columns disappear after horizontal scroll due to stale mounted state (#8964)

**Problem:**
Component columns (e.g., User, Location) disappear after scrolling horizontally (buffering out) and back (buffering in).
The previous attempt to fix this by setting `mounted = false` failed.
The root cause is that `Neo.grid.Row` defaults to `updateDepth: 1` (shallow). When a component placeholder re-enters the Row's VDOM, the framework maps the existing component instance to it, but since the component itself hasn't changed state, it doesn't trigger a render. The Row, performing a shallow update, sends only the placeholder, resulting in an empty cell.

**Solution:**
Set `updateDepth: -1` (deep update) in `Neo.grid.Row`.
This ensures that whenever the Row updates (including when scrolling columns back into view), it generates and sends the full VDOM tree, including the content of its child components. This guarantees that components render correctly when they reappear.

**Tasks:**
1.  Modify `src/grid/Row.mjs`:
    *   Set `updateDepth: -1` in `static config`.
    *   (Optimization) Keep the manual `me._vdom` assignment pattern.

## Timeline

- 2026-02-03T21:17:06Z @tobiu added the `bug` label
- 2026-02-03T21:17:06Z @tobiu added the `ai` label
- 2026-02-03T21:17:26Z @tobiu assigned to @tobiu
- 2026-02-03T21:17:44Z @tobiu added parent issue #8964
- 2026-02-03T21:28:57Z @tobiu referenced in commit `36add50` - "fix: Use deep VDOM updates (updateDepth: -1) for Grid Rows (#8973)"
### @tobiu - 2026-02-03T21:28:59Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `GridRow` to use `updateDepth: -1`. This forces a deep VDOM update, ensuring that child components (like Sparklines) are fully rendered when they are buffered back into view, resolving the issue of disappearing columns during horizontal scrolling.

- 2026-02-03T21:29:12Z @tobiu closed this issue

