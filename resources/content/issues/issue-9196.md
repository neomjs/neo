---
id: 9196
title: 'Feature: Add Collection.updateKey() method'
state: CLOSED
labels:
  - enhancement
  - core
assignees: []
createdAt: '2026-02-17T14:15:49Z'
updatedAt: '2026-03-24T08:54:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9196'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-24T08:54:15Z'
---
# Feature: Add Collection.updateKey() method

### Objective
Add `updateKey(item, newKey)` method to `Neo.collection.Base`.

### Motivation
When updating the key property of an item inside a Collection (e.g. `dataField` in `columnPositions`), developers currently have two bad options:
1. `remove(item)` + `add(item)`: Breaks array sort order (moves item to end).
2. Manual Map surgery: `map.delete(old)` + update + `map.set(new)`. Brittle and verbose.

### Proposal
Implement `updateKey(item, newKey)` which:
1. Updates the internal `map` safely.
2. Updates the `internalIdMap` if tracked.
3. Preserves the item's index in the `_items` array (Zero Array Mutation).
4. Optionally updates the item's property if it matches `keyProperty`.

### Use Case
Fixing grid column reordering bugs where dynamic `dataField` changes break virtualization order.

## Timeline

- 2026-02-17T14:15:50Z @tobiu added the `enhancement` label
- 2026-02-17T14:15:50Z @tobiu added the `core` label
- 2026-03-24T01:27:39Z @jhawpetoss6-collab referenced in commit `a7522cf` - "feat: implement updateKey() method for Neo.collection.Base #9196"
- 2026-03-24T01:27:39Z @jhawpetoss6-collab cross-referenced by PR #9536
- 2026-03-24T08:53:42Z @tobiu referenced in commit `bd7bab2` - "Merge pull request #9536 from jhawpetoss6-collab/strike/collection-update-key

feat: implement updateKey() method for Neo.collection.Base #9196"
### @tobiu - 2026-03-24T08:54:14Z

Closed via PR #9536

- 2026-03-24T08:54:15Z @tobiu closed this issue

