---
id: 9427
title: Fix TreeStore projection mutations and Row VDOM recycling
state: CLOSED
labels:
  - bug
  - ai
  - core
  - grid
assignees:
  - tobiu
createdAt: '2026-03-10T11:33:03Z'
updatedAt: '2026-03-10T11:34:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9427'
author: tobiu
commentsCount: 0
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-10T11:34:13Z'
---
# Fix TreeStore projection mutations and Row VDOM recycling

Two initial issues were identified with the TreeGrid implementation regarding updates when expanding/collapsing nodes:

1. **Row VDOM Recycling Bug:** When `grid.Body` intercepted a `recordChange` event, it called `row.createVdom()` with default arguments (`recycle=true`). Because the `recordId` of the mutating record didn't change, the cell recycling logic skipped calling `cellRenderer`. The `Tree` cell component never received updated primitive configs, failing to trigger UI updates. Fixed by calling `row.createVdom(false, false)` for record updates to enforce a fresh `cellRenderer` pass.
2. **TreeStore Projection Mutation Bug:** The `TreeStore`'s `expand` and `collapse` methods manipulate the flat visible grid array (the Projection Layer). However, they incorrectly called `me.splice()`, which is overridden to handle deep structural mutations (ingesting/removing from `#childrenMap`). Fixed by using `super.splice()` so visual mutations mutate the underlying `Collection` without corrupting the structural map layer.
3. **TreeStore.get() polymorphism:** The `TreeStore.get` method override failed to resolve Record object parameters into primitive keys, causing `expand` and `collapse` to instantly abort when passed a Record object. Fixed by implementing `isItem` checking.

*Note: While these structural fixes resolve the early returns and incorrect map mutations, we are still facing issues with visual rendering where icons occasionally fail to update or toggle state correctly on repeated clicks. This will be addressed in a follow-up task.*

## Timeline

- 2026-03-10T11:33:04Z @tobiu assigned to @tobiu
- 2026-03-10T11:33:05Z @tobiu added the `bug` label
- 2026-03-10T11:33:05Z @tobiu added the `ai` label
- 2026-03-10T11:33:05Z @tobiu added the `core` label
- 2026-03-10T11:33:05Z @tobiu added the `grid` label
- 2026-03-10T11:33:25Z @tobiu added parent issue #9404
- 2026-03-10T11:33:54Z @tobiu referenced in commit `a4154c0` - "fix(grid): Fix TreeStore projection mutations and Row VDOM recycling (#9427)"
- 2026-03-10T11:34:13Z @tobiu closed this issue

