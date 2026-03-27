---
id: 9433
title: 'TreeStore: Implement bulk expandAll() and collapseAll() methods'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-10T14:26:37Z'
updatedAt: '2026-03-11T09:55:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9433'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-11T09:55:39Z'
---
# TreeStore: Implement bulk expandAll() and collapseAll() methods

### Goal
Provide `expandAll()` and `collapseAll()` methods to toggle the entire tree state efficiently without locking the UI thread.

### Context
Currently, `TreeStore` only supports toggling individual nodes via `expand(nodeId)` and `collapse(nodeId)`. Each call triggers a localized recalculation of the visible projection (`_items`) and a UI update. If a user needs to expand a deeply nested tree with 5,000 nodes, doing so in a loop would cause 5,000 recalculations, freezing the App Worker.

### Acceptance Criteria
- Implement `expandAll()` and `collapseAll()` in `TreeStore.mjs`.
- These methods should iterate through the internal `#allRecordsMap` and flip the `collapsed` boolean on every node (silently, without triggering individual events if possible).
- After the bulk state change, the flat `_items` projection must be rebuilt *once* from the roots.
- Fire a single `mutate` or `refresh` event to update the UI.
- Write a unit test in `TreeStore.spec.mjs` to verify bulk expanding/collapsing on a deep hierarchy.

## Timeline

- 2026-03-10T14:26:39Z @tobiu added the `enhancement` label
- 2026-03-10T14:26:39Z @tobiu added the `ai` label
- 2026-03-10T14:26:39Z @tobiu added the `architecture` label
- 2026-03-10T14:26:39Z @tobiu added the `grid` label
- 2026-03-10T14:27:16Z @tobiu added parent issue #9404
- 2026-03-10T14:29:27Z @tobiu assigned to @tobiu
- 2026-03-11T09:54:44Z @tobiu referenced in commit `219f084` - "feat(data.TreeStore): Implement bulk expandAll() and collapseAll() methods (#9433)"
### @tobiu - 2026-03-11T09:54:58Z

**Input from Gemini 3.1 Pro:**

> ✦ The bulk expandAll() and collapseAll() methods have been implemented in `TreeStore.mjs` according to the acceptance criteria.
> 
> 1. Both methods iterate through the `#allRecordsMap` to perform bulk state modifications.
> 2. They handle both `Neo.data.Record` instances (via `setSilent`) and raw data objects (via direct property assignment) to accommodate "Turbo Mode".
> 3. After the state modification, they perform a single re-projection of the `_items` array using `collectVisibleDescendants` starting from the root nodes.
> 4. Instead of triggering multiple `splice` mutate events, they trigger a single `load` event passing the new `_items` projection, which `grid.Container` and other views already listen to for complete refreshes.
> 5. Unit tests have been added to `test/playwright/unit/data/TreeStore.spec.mjs` verifying the behavior of both methods and confirming that they correctly toggle the expansion states of deeply nested trees, and a separate test was added to verify it correctly manipulates items while in Turbo Mode.
> 
> The code is committed and pushed to the repository. I'll close this ticket now.

- 2026-03-11T09:55:40Z @tobiu closed this issue

