---
id: 8901
title: Remove Obsolete ID Sync Logic from VDom.mjs
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-28T15:29:53Z'
updatedAt: '2026-01-28T16:41:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8901'
author: tobiu
commentsCount: 1
parentIssue: 8899
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-28T16:41:34Z'
---
# Remove Obsolete ID Sync Logic from VDom.mjs

**Objective:**
Clean up the codebase by removing the complex, brittle ID syncing logic that is rendered obsolete by the new App-Authority ID system (Ticket #8900).

**Tasks:**
1.  **Modify `src/util/VDom.mjs`**:
    - Refactor `syncVdomState`.
    - **Remove** the ID syncing block (where it checks `!vdom.id` and assigns `vnode.id`).
    - **Remove** the logic that checks for `vnode.id !== vdom.id` mismatches (these should now be impossible).
    - **Keep** the scroll state synchronization (scrollTop, scrollLeft) and any other property syncing that is truly dynamic (e.g. value updates).

2.  **Modify `src/mixin/VdomLifecycle.mjs`**:
    - Refactor `syncVnodeTree`.
    - Simplify the child component mapping logic. It no longer needs to rely on complex heuristics or index matching to find "stolen" nodes, as IDs are now guaranteed to match.
    - Focus strictly on updating component `vnode` references and `mounted` state.

**Constraint:**
- Ensure that *rehydration* (Functional Components getting scroll state from existing VNodes) still works.


## Timeline

- 2026-01-28T15:29:55Z @tobiu added the `ai` label
- 2026-01-28T15:29:55Z @tobiu added the `refactoring` label
- 2026-01-28T15:29:55Z @tobiu added the `core` label
- 2026-01-28T15:34:18Z @tobiu added parent issue #8899
- 2026-01-28T15:49:01Z @tobiu cross-referenced by #8900
- 2026-01-28T15:50:19Z @tobiu referenced in commit `565c307` - "refactor: Remove obsolete ID Sync logic from VDom.mjs (Ticket #8901)"
### @tobiu - 2026-01-28T15:50:28Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `src/util/VDom.mjs` to remove the obsolete ID synchronization logic.
> 
> **Changes:**
> - Removed ID assignment block (VNode -> VDOM).
> - Removed ID mismatch guards.
> - Retained scroll state synchronization and recursive traversal for nested scroll containers.
> - Retained strict structure alignment (filtering `removeDom: true`) to ensure safe recursion.
> 
> **Next Steps:**
> I will proceed with Ticket #8902 (Verify Stability & Fix Tests). This is the critical phase where I expect some tests to fail due to the new strictness.

- 2026-01-28T16:41:30Z @tobiu assigned to @tobiu
- 2026-01-28T16:41:35Z @tobiu closed this issue

