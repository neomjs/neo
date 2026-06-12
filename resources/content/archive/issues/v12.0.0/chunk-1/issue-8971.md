---
id: 8971
title: 'fix: Enable horizontal scrolling by forcing Row VDOM updates on column mount change (#8964)'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-03T21:00:44Z'
updatedAt: '2026-02-03T21:07:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8971'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T21:07:35Z'
---
# fix: Enable horizontal scrolling by forcing Row VDOM updates on column mount change (#8964)

**Problem:**
Horizontal scrolling updates `mountedColumns` in `GridBody`. However, `createViewData` iterates over rows and calls `row.set({ record, rowIndex })`. Since vertical scrolling hasn't occurred, `record` and `rowIndex` are identical to their current values. The Neo.mjs config system detects no change and aborts the setter, preventing `afterSetRecord` (and thus `createVdom`) from firing. As a result, the Row VDOM is not updated to reflect the new set of visible columns.

**Solution:**
Utilize the `force` parameter in `createViewData` (introduced in #8970).
Update `GridBody.afterSetMountedColumns` to call `this.createViewData(false, true)`. This will bypass the config equality check and explicitly trigger `item.createVdom()`.

**Tasks:**
1.  Modify `src/grid/Body.mjs`: Update `afterSetMountedColumns` to pass `true` for the force parameter.


## Timeline

- 2026-02-03T21:00:49Z @tobiu added the `bug` label
- 2026-02-03T21:00:49Z @tobiu added the `ai` label
- 2026-02-03T21:01:24Z @tobiu assigned to @tobiu
- 2026-02-03T21:07:18Z @tobiu referenced in commit `6cee400` - "fix: Enable horizontal scrolling by forcing Row VDOM updates on column mount change (#8971)"
### @tobiu - 2026-02-03T21:07:22Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `GridBody.mjs` to force a view update when `mountedColumns` changes. This ensures that even if the row records are identical, the VDOM is regenerated to reflect the new column visibility.
> 
> Horizontal scrolling should now work as expected.

- 2026-02-03T21:07:35Z @tobiu closed this issue
- 2026-02-03T21:12:28Z @tobiu added parent issue #8964

