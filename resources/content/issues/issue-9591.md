---
id: 9591
title: Fix strict SSR parsing issues for CubeLayoutButton and highlighting
state: CLOSED
labels: []
assignees:
  - tobiu
createdAt: '2026-03-29T11:23:13Z'
updatedAt: '2026-03-30T11:30:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9591'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-30T11:30:45Z'
---
# Fix strict SSR parsing issues for CubeLayoutButton and highlighting

**Description**
When running server-side static HTML generation using the new `middleware-v2` architecture, a few components and guides threw errors during strict isolated node parsing:

1. `CubeLayoutButton` attempts to read `mainContentLayout` from `viewportController` synchronously in `construct`. In SSR, the button is rendered in the markdown parse stream before having a parent hierarchy, resulting in a `TypeError: Cannot read properties of null`.
2. The `GoogleAuthDemo.md` and `Authorization.md` guides contained `env` language tokens which are not recognized by `highlight.js`, causing it to log `console.error` and crash the strict rendering pipeline.

**Proposed Solution**
- Add optional chaining (`?.`) to `CubeLayoutButton.mjs` viewport controller reference.
- Change ` ```env ` to ` ```bash ` in the MCP authorization guides.

## Timeline

- 2026-03-29T11:25:19Z @tobiu referenced in commit `40fdc20` - "bug: Fix strict SSR parsing issues for CubeLayoutButton and highlighting (#9591)"
- 2026-03-30T11:30:42Z @tobiu assigned to @tobiu
- 2026-03-30T11:30:45Z @tobiu closed this issue

