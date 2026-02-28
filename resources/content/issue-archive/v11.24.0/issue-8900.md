---
id: 8900
title: Implement JIT ID Generation in TreeBuilder
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-28T15:29:43Z'
updatedAt: '2026-01-28T16:41:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8900'
author: tobiu
commentsCount: 1
parentIssue: 8899
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-28T16:41:23Z'
---
# Implement JIT ID Generation in TreeBuilder

**Objective:**
Implement the "App Authority" logic for VDOM IDs by modifying `TreeBuilder` to generate IDs just-in-time (JIT) during payload construction.

**Tasks:**
1.  **Modify `src/util/vdom/TreeBuilder.mjs`**:
    - Update `#buildTree` method.
    - When processing a node in VDOM mode (where `childKey` is effectively for VDOM construction), check if `node.id` is missing.
    - If missing, generate a new ID using `Neo.getId('neo-vnode')`.
    - **Crucial:** Assign this ID **in-place** to the `node` object (mutation) to ensure the ID persists on the VDOM blueprint for future updates.
    - Ensure this logic runs *before* any child recursion.

2.  **Modify `src/vdom/VNode.mjs`**:
    - Remove the current ID auto-generation logic (`Neo.getId(...)`).
    - Change the constructor to **throw an error** if `config.id` is missing.
    - This enforces the contract that *all* nodes arriving at the VDOM Worker must already have IDs.

**Constraint:**
- Respect the existing ID prefix conventions (`vnode` vs `vtext`).
- Ensure `removeDom: true` nodes also get IDs (to preserve identity if they are re-shown).


## Timeline

- 2026-01-28T15:29:44Z @tobiu added the `enhancement` label
- 2026-01-28T15:29:45Z @tobiu added the `ai` label
- 2026-01-28T15:29:45Z @tobiu added the `core` label
- 2026-01-28T15:29:54Z @tobiu cross-referenced by #8901
- 2026-01-28T15:34:13Z @tobiu added parent issue #8899
- 2026-01-28T15:48:45Z @tobiu referenced in commit `a1a369b` - "feat: Implement JIT ID Generation in TreeBuilder (Ticket #8900)"
### @tobiu - 2026-01-28T15:49:00Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the JIT ID generation logic.
> 
> **Changes:**
> 1.  Modified `src/util/vdom/TreeBuilder.mjs`:
>     - Added JIT ID generation in `#buildTree` when running in VDOM mode (`childKey === 'cn'`).
>     - Uses `Neo.getId('vtext')` for text nodes and `Neo.getId('vnode')` for others.
>     - Assigns IDs in-place to the source VDOM node to ensure persistence.
> 2.  Modified `src/vdom/VNode.mjs`:
>     - Removed auto-generation fallback.
>     - Now throws an error if `config.id` is missing, enforcing the App-Worker authority.
> 
> **Next Steps:**
> I will proceed with Ticket #8901 (Cleanup) in this same branch.

- 2026-01-28T16:41:11Z @tobiu assigned to @tobiu
- 2026-01-28T16:41:23Z @tobiu closed this issue

