---
id: 9539
title: Add TreeStore override for updateKey()
state: OPEN
labels:
  - enhancement
  - ai
  - core
assignees: []
createdAt: '2026-03-24T08:49:44Z'
updatedAt: '2026-03-24T08:49:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9539'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Add TreeStore override for updateKey()

### Objective
The newly added `updateKey(item, newKey)` method in `Neo.collection.Base` (introduced via PR #9536) does not currently support `Neo.data.TreeStore`.

`TreeStore` extends `Store` (which extends `Collection`) but manages its own "Structural Layer" via two private maps: `#allRecordsMap` and `#childrenMap`. 

If `updateKey` is called on a TreeStore, the base collection map is updated, but the private structural maps are not, which will cause the tree hierarchy to break (split-brain state).

### Proposal
Implement an override for `updateKey(item, newKey)` inside `src/data/TreeStore.mjs`.

1. Call `super.updateKey(item, newKey)` to handle the base collection maps.
2. Update `#allRecordsMap` to reflect the new key.
3. If the item is a parent node, its key might be used as the `parentId` for other nodes in `#childrenMap`. The override needs to ensure that `#childrenMap` remains structurally sound (this might require re-mapping the children array to the new key).

## Timeline

- 2026-03-24T08:49:45Z @tobiu added the `enhancement` label
- 2026-03-24T08:49:46Z @tobiu added the `ai` label
- 2026-03-24T08:49:46Z @tobiu added the `core` label
- 2026-03-24T08:52:42Z @tobiu cross-referenced by PR #9536

