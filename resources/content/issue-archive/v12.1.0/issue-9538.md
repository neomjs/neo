---
id: 9538
title: Enhance Collection.updateKey() to support filtered collections (allItems map)
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-24T08:49:06Z'
updatedAt: '2026-03-27T09:08:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9538'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T09:08:38Z'
---
# Enhance Collection.updateKey() to support filtered collections (allItems map)

### Objective
The newly added `updateKey(item, newKey)` method in `Neo.collection.Base` (introduced via PR #9536) correctly updates the primary `map` without mutating the `_items` array. However, it fails to account for filtered collections.

When a collection is filtered, it creates an `allItems` collection to store the unfiltered dataset. If a key is updated while the collection is filtered, the `map` inside `me.allItems` must also be updated to prevent a stale key mapping.

### Proposal
Update `src/collection/Base.mjs` -> `updateKey()` to check for the existence of `me.allItems`. If it exists, perform the identical map delete/set operation on `me.allItems.map`.

```javascript
// Pseudo-code concept:
if (me.allItems) {
    me.allItems.map.delete(oldKey);
    me.allItems.map.set(newKey, item);
}
```

## Timeline

- 2026-03-24T08:49:07Z @tobiu added the `enhancement` label
- 2026-03-24T08:49:08Z @tobiu added the `ai` label
- 2026-03-24T08:49:08Z @tobiu added the `core` label
- 2026-03-24T08:52:42Z @tobiu cross-referenced by PR #9536
- 2026-03-27T09:08:09Z @tobiu referenced in commit `c133b97` - "feat: Enhance Collection.updateKey() to support filtered collections (#9538)"
### @tobiu - 2026-03-27T09:08:19Z

**Input from Antigravity:**

> ◆ I have completed the implementation for this issue.
> 
> **Summary of Changes:**
> 1. Modified `updateKey(item, newKey)` in `src/collection/Base.mjs` to accurately propagate key changes to `allItems.map` when a collection is filtered.
> 2. Added comprehensive unit tests in `test/playwright/unit/collection/Base.spec.mjs` verifying that `updateKey()` handles both unfiltered and filtered collections seamlessly without breaking the indexing map.
> 3. Successfully executed `npm run test-unit` against the base collection specification, recording 9/9 passes.
> 
> The changes have been pushed to the remote repository and the issue is now complete.

- 2026-03-27T09:08:35Z @tobiu assigned to @tobiu
- 2026-03-27T09:08:38Z @tobiu closed this issue

