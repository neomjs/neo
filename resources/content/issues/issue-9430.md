---
id: 9430
title: 'TreeModel: Introduce childCount to decouple isLeaf state from emptiness'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-10T13:25:13Z'
updatedAt: '2026-03-10T13:34:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9430'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-10T13:34:53Z'
---
# TreeModel: Introduce childCount to decouple isLeaf state from emptiness

### Goal
Introduce a `childCount` field to `TreeModel` to decouple a node's intrinsic type (`isLeaf`) from its current structural state (empty vs populated) and ensure O(1) read access for UI components.

### Context
Currently, `isLeaf` is conceptually overloaded. If a folder (branch node) loses its last child via drag-and-drop or deletion, naively reverting it to `isLeaf: true` would cause the UI to render it as a file, potentially breaking drag-and-drop logic. A folder should remain `isLeaf: false` forever, even when empty.
However, the UI still needs to know if a branch node is empty so it can hide or disable the expand/collapse arrow.

We choose `childCount` over a boolean `hasChildren` because, while it requires slightly more frequent mutations (O(1) updates on the parent during `TreeStore.splice()`), it provides maximum data availability for the `grid.Row` hot-path. Developers can render badges like "Folder (5 items)" directly from `record.childCount` without expensive `store.get()` or `#childrenMap` lookups during 120fps virtual scrolling.

### Acceptance Criteria
- Add `childCount` (Integer, default `0`) to `Neo.data.TreeModel`.
- Update `TreeStore.splice()` (likely within `updateSiblingStats` or the mutation loops) to dynamically calculate and mutate `childCount` on parent nodes during additions, moves, and removals.
- Ensure "Turbo Mode" (lazy instantiation) supports `childCount` directly on raw data objects.
- Add a Playwright unit test verifying `childCount` updates correctly when children are added or removed, while the parent's `isLeaf` state remains unchanged.

## Timeline

- 2026-03-10T13:25:14Z @tobiu added the `enhancement` label
- 2026-03-10T13:25:14Z @tobiu added the `ai` label
- 2026-03-10T13:25:14Z @tobiu added the `architecture` label
- 2026-03-10T13:25:15Z @tobiu added the `core` label
- 2026-03-10T13:25:32Z @tobiu added parent issue #9404
- 2026-03-10T13:33:53Z @tobiu referenced in commit `6bc5aa9` - "feat(data): Introduce childCount to TreeModel to decouple isLeaf state (#9430)"
### @tobiu - 2026-03-10T13:34:12Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully implemented `childCount` on `TreeModel` and updated the `TreeStore` mutation logic.
> 
> **Implementation Details:**
> 1. **Model:** Added `childCount` (`Integer`, default `0`) to `Neo.data.TreeModel`.
> 2. **Mutation Logic:** Updated `TreeStore.updateSiblingStats(parentId)`. Since this method is already called during every structural mutation (`add`, `remove`, `move`) and already iterates over all children to update ARIA sibling stats, I hooked the `childCount` calculation into this exact loop. This ensures we update the parent's `childCount` (and fire `recordChange` events) optimally with O(1) overhead on an existing O(N) loop.
> 3. **Soft Hydration:** Updated the initialization loop in `TreeStore.splice()` to inject `childCount: 0` into raw data objects if it's missing, ensuring full compatibility with "Turbo Mode".
> 
> **Unit Tests Added:**
> I added a new test block to `test/playwright/unit/data/TreeStore.spec.mjs`:
> - `childCount should accurately reflect the number of children and decouple from isLeaf`: Verifies that adding children increases `childCount`, and removing all children drops `childCount` to `0` while keeping `isLeaf: false`.
> - Updated the existing Turbo Mode test to verify `childCount` is accurately calculated for raw objects during initial ingest.
> 
> All tests are passing. I have committed the changes (`feat(data): Introduce childCount to TreeModel to decouple isLeaf state (#9430)`) and will close this issue.

- 2026-03-10T13:34:37Z @tobiu assigned to @tobiu
- 2026-03-10T13:34:53Z @tobiu closed this issue

