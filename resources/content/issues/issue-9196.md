---
id: 9196
title: 'Feature: Add Collection.updateKey() method'
state: OPEN
labels:
  - enhancement
  - core
assignees: []
createdAt: '2026-02-17T14:15:49Z'
updatedAt: '2026-02-17T14:15:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9196'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

