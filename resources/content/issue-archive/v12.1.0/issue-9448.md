---
id: 9448
title: TreeGrid Component pooling accumulates `is-leaf` class leading to visual bugs
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-12T11:29:39Z'
updatedAt: '2026-03-12T11:31:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9448'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-12T11:31:50Z'
---
# TreeGrid Component pooling accumulates `is-leaf` class leading to visual bugs

### Description
In `Neo.grid.column.component.Tree`, the `updateIconCls()` method mutates the class array using `cls.push('is-leaf')` inside multiple `afterSet...` hooks (e.g. `afterSetIsLeaf`, `afterSetCollapsed`, etc). When multiple configs change simultaneously (e.g., when a grid cell is recycled by the virtual scroller for a different record), `updateIconCls()` runs synchronously multiple times before the vdom update is flushed.

This causes state classes like `is-expanded` and `is-leaf` to be pushed multiple times into the `cls` array. Later, when the component is recycled again, `NeoArray.remove()` only removes the **first** instance of these duplicate classes. This leads to conflicting classes persisting on the DOM node (e.g. `<div class="neo-tree-toggle is-leaf is-expanded">`), causing folder icons to disappear.

### Solution
Use `NeoArray.add(cls, ...)` instead of `cls.push(...)` in `Tree.mjs` to ensure the state classes are unique within the array, preventing the accumulator bug during rapid config updates.

## Timeline

- 2026-03-12T11:29:40Z @tobiu added the `bug` label
- 2026-03-12T11:29:40Z @tobiu added the `ai` label
- 2026-03-12T11:29:40Z @tobiu added the `grid` label
- 2026-03-12T11:30:37Z @tobiu assigned to @tobiu
- 2026-03-12T11:30:51Z @tobiu added parent issue #9404
- 2026-03-12T11:31:06Z @tobiu referenced in commit `9095a0d` - "fix(grid): prevent duplicate state classes in Tree component during pooling (#9448)"
### @tobiu - 2026-03-12T11:31:22Z

**Input from Gemini 3.1 Pro:**

> ✦ The bug was diagnosed and fixed. The issue was that `updateIconCls()` in `src/grid/column/component/Tree.mjs` was using `.push()` on the `cls` array inside multiple `afterSet...` hooks. During rapid state changes (e.g. Row Pooling where the same component gets multiple new configs like `collapsed` and `isLeaf`), `.push()` accumulated multiple instances of the state classes. Later, `NeoArray.remove()` only removes the *first* instance, leaving stale classes on the DOM node. Replacing `.push()` with `NeoArray.add()` ensures only unique classes are kept, fixing the visual glitch in the tree grid.
> 
> Test `test/playwright/e2e/GridTree.spec.mjs` now passes successfully.

- 2026-03-12T11:31:50Z @tobiu closed this issue
- 2026-03-12T11:41:20Z @tobiu cross-referenced by #9412

