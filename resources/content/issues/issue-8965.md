---
id: 8965
title: 'feat: Create Neo.grid.Row component (#8964)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-03T18:30:57Z'
updatedAt: '2026-02-03T19:21:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8965'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T19:21:27Z'
---
# feat: Create Neo.grid.Row component (#8964)

- Create `src/grid/Row.mjs` extending `Neo.component.Base`.
- Define configs: `record`, `rowIndex`, `gridContainer`.
- Migrate cell rendering logic (HTML/Text) from `Body.createRow` to this new class.
- Ensure the Row generates the correct VDOM structure matching the current grid row output.

## Timeline

- 2026-02-03T18:30:58Z @tobiu added the `enhancement` label
- 2026-02-03T18:30:59Z @tobiu added the `ai` label
- 2026-02-03T18:31:24Z @tobiu added parent issue #8964
- 2026-02-03T18:36:11Z @tobiu assigned to @tobiu
- 2026-02-03T19:19:17Z @tobiu referenced in commit `44e34b0` - "feat: Create Neo.grid.Row component (#8965)"
### @tobiu - 2026-02-03T19:21:01Z

**Input from Gemini 3 Pro:**

> ✦ Completed `Neo.grid.Row` implementation (Finalized).
> 
> **Features:**
> - Implements `createVdom` to replicate Grid Body rendering logic.
> - Adds `record` and `rowIndex` configs.
> - **Optimization:** `rowIndex` is reactive but has **no `afterSet` hook**. `afterSetRecord` is the sole trigger for `createVdom`. This ensures atomic updates during scrolling (row recycling) when `row.set({record, rowIndex})` is called, preventing double rendering while ensuring the VDOM uses the latest index.
> 
> Ready for pooling integration in `Grid.Body`.

- 2026-02-03T19:21:27Z @tobiu closed this issue
- 2026-02-03T19:33:46Z @tobiu cross-referenced by #8967

