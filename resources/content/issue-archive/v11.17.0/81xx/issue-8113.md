---
id: 8113
title: 'Neo.container.Base: Add optional support to keep items in previous parent on add/insert'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-15T12:04:57Z'
updatedAt: '2025-12-15T12:06:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8113'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-15T12:06:27Z'
---
# Neo.container.Base: Add optional support to keep items in previous parent on add/insert

Add a new optional parameter `removeFromPreviousParent` (defaulting to `true`) to `add`, `insert`, and `createItem` methods in `Neo.container.Base`.

**Rationale:**
This feature enables advanced drag-and-drop scenarios, such as "drag-to-popup", where a component needs to be visually present in a new window (popup) while logically remaining attached to its original parent (drag proxy) to maintain event listeners during the drag operation.

**Implementation Details:**
- Update `add`, `insert`, and `createItem` signatures.
- In `createItem`:
    - If `removeFromPreviousParent` is `true` (default), execute `parent.remove(item, false)`.
    - If `removeFromPreviousParent` is `false`, skip removal.
    - When moving between windows (`parent.windowId !== me.windowId`), handle the `mounted` state:
        - If `removeFromPreviousParent` is `true`, set `item.mounted = false`.
        - If `removeFromPreviousParent` is `false`, set `item._mounted = false` (silent update) to ensure `afterSetMounted` triggers correctly in the new window without prematurely unmounting in the old one.

## Timeline

- 2025-12-15T12:04:57Z @tobiu added the `enhancement` label
- 2025-12-15T12:04:58Z @tobiu added the `ai` label
- 2025-12-15T12:05:22Z @tobiu assigned to @tobiu
- 2025-12-15T12:06:02Z @tobiu referenced in commit `9bd4d5d` - "Neo.container.Base: Add optional support to keep items in previous parent on add/insert #8113"
### @tobiu - 2025-12-15T12:06:07Z

**Input from Neo Agent:**

> ◆ I have verified the implementation of `removeFromPreviousParent` in `src/container/Base.mjs`. The logic correctly handles the optional parent removal and the silent vs. loud `mounted` state update as specified.

- 2025-12-15T12:06:27Z @tobiu closed this issue

