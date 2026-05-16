---
id: 9539
title: Add TreeStore override for updateKey()
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-24T08:49:44Z'
updatedAt: '2026-03-27T09:26:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9539'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T09:26:17Z'
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
### @tobiu - 2026-03-27T09:25:02Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Implementation for `Neo.data.TreeStore.updateKey()` override has been completed.
> 
> **Summary of Changes:**
> 1. Intercepted `updateKey(item, newKey)` on `TreeStore`.
> 2. Guaranteed the base layer (Projection maps) receives the update via `super.updateKey`.
> 3. Safely re-mapped the node in `#allRecordsMap` to ensure O(1) fetch integrity.
> 4. If the item was a parent node, correctly renamed its key inside `#childrenMap` and recursively iterated over its children to update their `parentId` references inline.
> 5. Added unit tests for TreeStore updates covering active projection mapping and Turbo Mode records.
> 
> The changes have been pushed to remote and the ticket is now closed.

- 2026-03-27T09:26:14Z @tobiu referenced in commit `17d3ff4` - "feat(TreeStore): add updateKey override (#9539)"
- 2026-03-27T09:26:15Z @tobiu assigned to @tobiu
- 2026-03-27T09:26:17Z @tobiu closed this issue

