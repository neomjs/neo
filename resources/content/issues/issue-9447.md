---
id: 9447
title: 'TreeGrid: Fix 7-click expand/collapse bug and redundant change events'
state: CLOSED
labels:
  - bug
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-03-12T10:35:39Z'
updatedAt: '2026-03-12T10:37:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9447'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-12T10:37:15Z'
---
# TreeGrid: Fix 7-click expand/collapse bug and redundant change events

### Problem
Users reported a bug in the TreeGrid where clicking an expand/collapse icon required 7 clicks before the icon visually updated to reflect the new state, even though rows were added/removed correctly on the first click.

### Analysis
The `TreeStore.mjs` `expand` and `collapse` methods were manually firing `me.onRecordChange` immediately after mutating a node property (e.g., `node.collapsed = false`). 
However, since `node` is guaranteed to be a fully hydrated `Record` instance (via `me.get()`), the property mutation itself already triggers the `notifyChange` setter in `RecordFactory`, which increments `record.version` and fires `onRecordChange` natively.

The duplicate, manual `onRecordChange` call fired a second event *without* incrementing the `record.version`. This caused a race condition in `grid.Body` and `Component.mjs#cellRenderer`, where the VDOM update short-circuited because `component.lastRecordVersion === record.version`. The 7 clicks forced a row recycle, bypassing the short-circuit and finally updating the DOM.

### Solution
1. Removed all redundant manual `me.onRecordChange` calls in `collapse()` and `expand()`.
2. Changed single-property updates to direct assignment (`node.collapsed = true`), relying on the `RecordFactory` setter.
3. Changed multi-property async updates to use batched assignment (`node.set({ isLoading: false, collapsed: false })`) to fire a single, clean `mutate` event.
4. Added an E2E test (`GridTree.spec.mjs`) to verify the correct node expand/collapse behavior on the first click.

## Timeline

- 2026-03-12T10:35:39Z @tobiu added the `bug` label
- 2026-03-12T10:35:40Z @tobiu added the `ai` label
- 2026-03-12T10:35:40Z @tobiu added the `testing` label
- 2026-03-12T10:36:22Z @tobiu referenced in commit `4b129db` - "bug(TreeGrid): Fix 7-click expand/collapse race condition and redundant events (#9447)"
- 2026-03-12T10:36:37Z @tobiu assigned to @tobiu
- 2026-03-12T10:37:00Z @tobiu added parent issue #9404
### @tobiu - 2026-03-12T10:37:14Z

Fixed by removing redundant manual `onRecordChange` calls in `TreeStore.mjs` and batching multiple property assignments with `node.set({...})` to fire a single clean mutate event. E2E test added to verify toggle behavior.

- 2026-03-12T10:37:15Z @tobiu closed this issue

