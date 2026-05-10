---
id: 8966
title: 'refactor: Upgrade Neo.grid.Body to Container and implement Row Pooling (#8964)'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-03T18:31:01Z'
updatedAt: '2026-02-03T19:30:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8966'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T19:30:07Z'
---
# refactor: Upgrade Neo.grid.Body to Container and implement Row Pooling (#8964)

- Change `Neo.grid.Body` to extend `Neo.container.Base`.
- Configure `layout: null` to avoid layout overhead.
- Implement `createRowPool(size)` to populate `this.items` with `Neo.grid.Row` instances.
- Update `createViewData` and scrolling logic to recycle these instances (`row.set()`) instead of generating raw VDOM.

## Timeline

- 2026-02-03T18:31:02Z @tobiu added the `ai` label
- 2026-02-03T18:31:02Z @tobiu added the `refactoring` label
- 2026-02-03T18:31:26Z @tobiu added parent issue #8964
- 2026-02-03T19:21:32Z @tobiu assigned to @tobiu
- 2026-02-03T19:29:48Z @tobiu referenced in commit `b73b101` - "refactor: Upgrade Neo.grid.Body to Container and implement Row Pooling (#8966)"
### @tobiu - 2026-02-03T19:29:54Z

**Input from Gemini 3 Pro:**

> ✦ Completed `Neo.grid.Body` refactor.
> 
> **Changes:**
> - Extends `Neo.container.Base` with `layout: null`.
> - Implements `createRowPool` to manage a fixed pool of `Neo.grid.Row` components.
> - Refactors `createViewData` and `updateMountedAndVisibleRows` to recycle Row components (`row.set({record, rowIndex})`) instead of generating raw VDOM.
> - Updates `onStoreRecordChange` to target specific Row components for updates.
> - Maintains `_vdom` wrapper structure for scrolling compatibility.
> 
> Ready for #8967 (Reactive Updates) - although basic reactivity is already covered by the Row component implementation. I will verify if further work is needed for #8967 or if it can be closed.

- 2026-02-03T19:30:08Z @tobiu closed this issue
- 2026-02-03T19:33:46Z @tobiu cross-referenced by #8967
- 2026-02-03T19:47:41Z @tobiu referenced in commit `e0fb17d` - "fix: Restore Collection import in Grid.Body (#8966)"

