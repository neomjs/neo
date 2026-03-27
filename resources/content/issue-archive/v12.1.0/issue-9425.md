---
id: 9425
title: Refactor Tree cell component architecture for performance
state: CLOSED
labels:
  - enhancement
  - refactoring
  - performance
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T20:22:29Z'
updatedAt: '2026-03-09T20:23:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9425'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-09T20:23:34Z'
---
# Refactor Tree cell component architecture for performance

### Goal
To optimize the `Neo.grid.column.component.Tree` cell component by eliminating redundant state configs and consolidating VDOM updates, improving rendering performance during fast scrolling.

### Context
The initial implementation of the Tree cell component duplicated record data (`depth`, `expanded`, `isLeaf`) into separate reactive configs. This resulted in poor performance during row recycling, as updating a single record would trigger multiple consecutive `afterSet` hooks and redundant VDOM `update()` calls. It also created unnecessary overhead in the parent `grid.column.Tree` which had to manually unpack the record into these configs.

### Requirements
1.  **Remove Redundant State:** Remove `depth_`, `expanded_`, and `isLeaf_` from `grid.column.component.Tree`. The `record_` is the single source of truth.
2.  **Consolidate Updates:** Move all structural styling logic (indentation depth, toggle icons) into a single `afterSetRecord` hook, ensuring only one `me.update()` is called per recycle.
3.  **Simplify Column Feed:** Update `applyRecordConfigs` in `grid.column.Tree` to only pass the extracted `value`, relying on the component to read its own bound `record`.
4.  **Fix Event Target:** Update `onToggleClick` to cleanly access the store via `me.parent.gridContainer`.


## Timeline

- 2026-03-09T20:22:29Z @tobiu assigned to @tobiu
- 2026-03-09T20:22:30Z @tobiu added the `enhancement` label
- 2026-03-09T20:22:30Z @tobiu added the `refactoring` label
- 2026-03-09T20:22:30Z @tobiu added the `performance` label
- 2026-03-09T20:22:30Z @tobiu added the `grid` label
- 2026-03-09T20:22:37Z @tobiu added parent issue #9404
- 2026-03-09T20:23:01Z @tobiu referenced in commit `1ab27f9` - "refactor(grid): Clean up Tree cell component architecture (#9425)"
### @tobiu - 2026-03-09T20:23:08Z

**Input from Gemini 3.1 Pro:**

> ✦ I have rewritten the Tree cell component to rely purely on the `afterSetRecord` hook. 
> 
> - All redundant state configs (`depth_`, `expanded_`, `isLeaf_`) have been removed.
> - VDOM updates (indent style, toggle classes) are now batched into a single method during row recycling.
> - `applyRecordConfigs` was simplified to only pass down `value`.
> 
> Committed and pushed. Closing ticket.

- 2026-03-09T20:23:34Z @tobiu closed this issue

