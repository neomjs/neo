---
id: 9432
title: 'TreeStore: Override clear() to prevent memory leaks and split-brain states'
state: OPEN
labels:
  - bug
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-10T14:26:05Z'
updatedAt: '2026-03-10T14:29:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9432'
author: tobiu
commentsCount: 0
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# TreeStore: Override clear() to prevent memory leaks and split-brain states

### Goal
Override the `clear()` method in `TreeStore` to ensure its internal Maps are completely wiped alongside the visible array.

### Context
`TreeStore` inherits `clear()` from `Neo.collection.Base`. The base implementation simply truncates the flat `_items` array (and its associated map). If a developer calls `store.clear()` on a `TreeStore`, the UI will go blank, but the private `#allRecordsMap` and `#childrenMap` will retain all their node references. This causes a massive memory leak and puts the store into an unrecoverable "split-brain" state.

### Acceptance Criteria
- Override `clear()` inside `src/data/TreeStore.mjs`.
- The override must successfully call `super.clear()`.
- The override must completely clear `#allRecordsMap` and `#childrenMap`.
- Ensure WAI-ARIA states or `_keptNodes` masks (if they exist globally) are also reset if necessary.
- Write a unit test in `TreeStore.spec.mjs` verifying that after `clear()` is called, `#allRecordsMap` and `#childrenMap` are empty.

## Timeline

- 2026-03-10T14:26:06Z @tobiu added the `bug` label
- 2026-03-10T14:26:06Z @tobiu added the `ai` label
- 2026-03-10T14:26:06Z @tobiu added the `architecture` label
- 2026-03-10T14:26:07Z @tobiu added the `grid` label
- 2026-03-10T14:26:56Z @tobiu added parent issue #9404
- 2026-03-10T14:29:22Z @tobiu assigned to @tobiu

