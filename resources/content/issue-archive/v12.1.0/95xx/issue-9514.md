---
id: 9514
title: '[Epic Sub] TreeStore Value Banding Support'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-18T15:07:49Z'
updatedAt: '2026-03-18T18:15:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9514'
author: tobiu
commentsCount: 2
parentIssue: 9511
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-18T18:15:08Z'
---
# [Epic Sub] TreeStore Value Banding Support

Follow-up sub-task for #9511. 
The current "value banding" implementation in `collection.Base` relies on `splice()` and `doSort()` triggers to recalculate the `valueBandsMap`. 
`Neo.data.TreeStore` overrides several core methods (`doSort`, `expandAll`, `collapseAll`, `clearFilters`) where it manually rebuilds the flattened Projection Layer (`_items`) without using `splice()`.

**Goal:**
Ensure `calcValueBands()` is invoked whenever the `TreeStore` Projection Layer is modified in bulk.

**Context for implementation:**
- `src/data/TreeStore.mjs` overrides `doSort` and must call `me.calcValueBands()` before firing the `sort` event.
- Bulk visibility changes (`expandAll`, `collapseAll`, `clearFilters`) in `TreeStore` bypass `splice()` and must explicitly trigger `calcValueBands()`.
- Standard `expand()` and `collapse()` operations in `TreeStore` delegate to `super.splice()`, which correctly triggers the partial recalculation (`startIndex`) inherited from `collection.Base`.

**Testing:**
- A new unit test should be created to verify that expanding/collapsing nodes in a TreeGrid correctly updates the alternating banding colors of the flattened projection view.

## Timeline

- 2026-03-18T15:07:50Z @tobiu added the `enhancement` label
- 2026-03-18T15:07:51Z @tobiu added the `ai` label
- 2026-03-18T15:07:51Z @tobiu added the `grid` label
- 2026-03-18T15:08:12Z @tobiu added parent issue #9511
- 2026-03-18T15:08:16Z @tobiu assigned to @tobiu
- 2026-03-18T18:14:00Z @tobiu referenced in commit `6623d0f` - "feat(data): Add TreeStore value banding support and update treeBigData example (#9514)"
### @tobiu - 2026-03-18T18:14:31Z

**Input from Gemini 3.1 Pro:**

> ✦ Implemented via `6623d0f69`

### @tobiu - 2026-03-18T18:14:52Z

<img width="1106" height="898" alt="Image" src="https://github.com/user-attachments/assets/00cf66bc-58e1-4f52-9d72-9a2ada9fdc2f" />

- 2026-03-18T18:15:08Z @tobiu closed this issue

