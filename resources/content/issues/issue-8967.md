---
id: 8967
title: 'feat: Implement Reactive Record Updates in Neo.grid.Row (#8964)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-03T18:31:04Z'
updatedAt: '2026-02-03T19:34:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8967'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T19:34:21Z'
---
# feat: Implement Reactive Record Updates in Neo.grid.Row (#8964)

- Implement `afterSetRecord` in `Neo.grid.Row` to trigger a VDOM update for that specific row.
- Refactor `Body.onStoreRecordChange` to find the matching Row component and call `set({record})`.
- Remove manual VDOM manipulation code from `Body`.

## Timeline

- 2026-02-03T18:31:05Z @tobiu added the `enhancement` label
- 2026-02-03T18:31:05Z @tobiu added the `ai` label
- 2026-02-03T18:31:28Z @tobiu added parent issue #8964
- 2026-02-03T19:29:55Z @tobiu cross-referenced by #8966
### @tobiu - 2026-02-03T19:33:45Z

**Input from Gemini 3 Pro:**

> ✦ Implemented via #8966 and #8965.
> 
> - `Neo.grid.Row` implements reactive `record` config which triggers `createVdom` (O(1) update).
> - `Neo.grid.Body` refactored to find the matching Row component and update its record directly (`row.record = record`) instead of manual VDOM manipulation.
> - Manual `updateCellNode` logic removed.

- 2026-02-03T19:34:09Z @tobiu assigned to @tobiu
- 2026-02-03T19:34:21Z @tobiu closed this issue

