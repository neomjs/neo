---
id: 9525
title: Fix header resize proxy visibility and prevent unwanted absolute styles on drop
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-20T11:36:36Z'
updatedAt: '2026-03-20T12:41:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9525'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-20T12:41:54Z'
---
# Fix header resize proxy visibility and prevent unwanted absolute styles on drop

### Description
There are two visual bugs with the current grid column resizing implementation:
1. **Invisible Proxy:** During `drag:move`, the resize drag proxy is not visible to the user.
2. **Polluted Styles:** On `drag:end`, the base `Neo.plugin.Resizable` blindly copies the proxy's `wrapperStyle` (which includes absolute coordinates like `left`, `top`, and fixed `height`) back to the real header button. This breaks the flexbox layout of the header toolbar.

### Goal
- Investigate why the proxy is hidden during the drag (likely a z-index or overflow issue).
- Refactor the `onDragEnd` logic in `src/grid/header/plugin/Resizable.mjs` (or the base class) to only apply the desired dimension (`width`) and strip away the absolute positioning/height coordinates from the real component's `wrapperStyle`.

## Timeline

- 2026-03-20T11:36:37Z @tobiu added the `bug` label
- 2026-03-20T11:36:37Z @tobiu added the `ai` label
- 2026-03-20T11:36:37Z @tobiu added the `grid` label
- 2026-03-20T11:36:55Z @tobiu assigned to @tobiu
- 2026-03-20T12:41:15Z @tobiu referenced in commit `254f0fb` - "fix(grid): proxy visibility and style cleanup during header resize (#9525)

- Added position: relative to .neo-grid-header-button in SCSS so the absolute .neo-resizable handles attach to the button correctly instead of flying off to nearest positioned ancestor.
- Lowered default minWidth to 100 for grid header resizers.
- Overrode onDragMove in grid.header.plugin.Resizable to delete the proxy's hardcoded style.width, allowing wrapperStyle to control the visual size during drag.
- Fixed inline style pollution on drop: setting wrapperStyle properties to null instead of using delete, as Neo's config system requires null to truly remove a merged vdom style."
### @tobiu - 2026-03-20T12:41:33Z

**Input from Gemini 3.1 Pro:**

> ✦ Fixed in commit 254f0fb25. The problem with proxy visibility and resizing during `drag:move` was rooted in the fact that `Neo.component.Base` merges its configs differently when `useProxyWrapper` is false. By deleting the hardcoded `width` from the proxy's internal style on every `dragMove`, the framework allows `wrapperStyle` to control the proxy dimensions as intended. I also updated `minWidth` to `100` and `style` nullification in `onDragEnd` to prevent drop pollution.

- 2026-03-20T12:41:54Z @tobiu closed this issue

