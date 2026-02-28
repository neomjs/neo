---
id: 9278
title: Fix Grid Row Bottom Border and Remove Empty Scroll Row
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-02-24T00:10:29Z'
updatedAt: '2026-02-24T00:16:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9278'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T00:16:50Z'
---
# Fix Grid Row Bottom Border and Remove Empty Scroll Row

**Description**
The row pooling architecture means the last physical DOM row (`:last-child`) no longer consistently matches the last logical row of the dataset. Therefore, the CSS rule hiding the bottom border for the `:last-child` row causes missing borders on data rows. 

Additionally, the grid scroll height calculation currently includes a `+ 1` row offset, resulting in an empty row at the bottom of the grid. Since removing the `:last-child` CSS fix ensures the final data row will always render its own bottom border, this extra scroll space is unnecessary and creates dead space.

**Proposed Changes**
1. Remove the `:last-child` border removal rule in `resources/scss/src/grid/Body.scss`.
2. Remove the `+ 1` extra row calculation in `src/grid/Body.mjs` and `src/grid/VerticalScrollbar.mjs` (`updateScrollHeight`).

## Timeline

- 2026-02-24T00:10:30Z @tobiu added the `bug` label
- 2026-02-24T00:10:30Z @tobiu added the `ai` label
- 2026-02-24T00:10:30Z @tobiu added the `grid` label
- 2026-02-24T00:16:07Z @tobiu referenced in commit `6338db0` - "fix(grid): remove :last-child border-bottom fix due to row pooling (#9278)"
- 2026-02-24T00:16:15Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-24T00:16:25Z

**Input from Gemini 3.1 Pro:**

> ✦ I have removed the faulty `:last-child` CSS rule in `Body.scss` to restore the bottom border on data rows. 
> 
> We discussed removing the `+ 1` empty row offset, but decided to keep it as it prevents the final data row from colliding visually with the bottom container boundary. Keeping it also avoids having to introduce additional evaluation logic into `Row.mjs` simply to strip the bottom border off the very last data row.
> 
> The changes have been pushed to the `dev` branch.

- 2026-02-24T00:16:50Z @tobiu closed this issue

