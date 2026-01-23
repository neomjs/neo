---
id: 8869
title: 'Fix: VDomUpdate merged updates do not support recursion'
state: OPEN
labels:
  - bug
  - ai
  - core
assignees: []
createdAt: '2026-01-23T19:58:59Z'
updatedAt: '2026-01-23T19:58:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8869'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix: VDomUpdate merged updates do not support recursion

**Description:**
The `VDomUpdate` manager handles merging child component updates into parent updates to reduce IPC traffic.
Currently, `getMergedChildIds(ownerId)` only retrieves the **direct** children merged into the owner.

**Problem:**
If we have a nested merge scenario:
1.  **Grandchild** updates -> Merges into **Child**.
2.  **Child** updates -> Merges into **Parent**.

When `Parent` updates, `getMergedChildIds(Parent)` only returns `Child`.
`TreeBuilder` (running for Parent) sees `Child` as dirty and expands it.
However, when `TreeBuilder` recurses to `Child`, it checks if `Grandchild` is in the `mergedChildIds` set (Parent's set).
It is **missing**.
Therefore, `TreeBuilder` treats `Grandchild` as clean and prunes it (sends a placeholder), even though `Grandchild` has pending updates.

**Result:**
Deeply nested updates can be lost or incorrectly pruned during a merged update cycle.

**Proposed Fix:**
Update `Neo.manager.VDomUpdate.getMergedChildIds` to recursively traverse the `mergedCallbackMap`.
If a merged child (`Child`) is itself an owner of updates (`Grandchild`), those grandchildren IDs must also be added to the returned set.

**Related Files:**
-   `src/manager/VDomUpdate.mjs`


## Timeline

- 2026-01-23T19:59:00Z @tobiu added the `bug` label
- 2026-01-23T19:59:01Z @tobiu added the `ai` label
- 2026-01-23T19:59:01Z @tobiu added the `core` label

