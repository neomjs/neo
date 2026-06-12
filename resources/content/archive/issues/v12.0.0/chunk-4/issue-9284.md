---
id: 9284
title: 'Grid Container: Pass initial theme to child instances'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-02-24T02:32:11Z'
updatedAt: '2026-02-24T02:35:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9284'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T02:35:07Z'
---
# Grid Container: Pass initial theme to child instances

When `Neo.grid.Container` instantiates its child components (`GridBody`, `HeaderToolbar`, `FooterToolbar`, and `VerticalScrollbar`) during construction, it properly passes down structural configs like `parentId`, `store`, and `windowId`, but it missed the initial `theme` value.

Because of this, if a Grid was created dynamically while the application was already in dark mode, these child components (and everything inside them) would render with the default light mode until a subsequent reactive toggle updated the global theme.

**Resolution:**
- Updated `src/grid/Container.mjs` to map `theme: me.theme` into the instantiation calls inside `beforeSetBody`, `beforeSetFooterToolbar`, `beforeSetHeaderToolbar`, and `construct` (for the scrollbar). This guarantees full visual consistency at birth.

## Timeline

- 2026-02-24T02:32:11Z @tobiu added the `bug` label
- 2026-02-24T02:32:12Z @tobiu added the `ai` label
- 2026-02-24T02:32:12Z @tobiu added the `core` label
- 2026-02-24T02:32:26Z @tobiu assigned to @tobiu
- 2026-02-24T02:34:45Z @tobiu referenced in commit `99f45f5` - "fix(grid): Pass initial theme to child instances (#9284)

When Neo.grid.Container instantiates its child components (GridBody, HeaderToolbar, FooterToolbar, and VerticalScrollbar) during construction, it properly passes down structural configs like parentId, store, and windowId, but it missed the initial theme value.

Updated src/grid/Container.mjs to map theme: me.theme into the instantiation calls inside beforeSetBody, beforeSetFooterToolbar, beforeSetHeaderToolbar, and construct (for the scrollbar)."
### @tobiu - 2026-02-24T02:34:55Z

The fix has been implemented and pushed to the `dev` branch.

- 2026-02-24T02:35:07Z @tobiu closed this issue

