---
id: 9286
title: '[Bug] Grid Component Columns Retain Stale State on Scroll'
state: CLOSED
labels:
  - bug
  - ai
  - core
  - grid
assignees:
  - tobiu
createdAt: '2026-02-24T09:58:38Z'
updatedAt: '2026-02-24T10:03:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9286'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T10:03:03Z'
---
# [Bug] Grid Component Columns Retain Stale State on Scroll

**Describe the bug**
During grid scrolling (Row Pooling), existing cell components are recycled for new records. If a new record is missing a data field (e.g. `organizations`), the field returns `undefined`. The Neo.mjs config system's `set()` method ignores `undefined` values, meaning the component retains the old record's state, causing visual bugs (e.g., showing a GitHub org from the previous row on a user who has no orgs).

**To Reproduce**
Steps to reproduce the behavior:
1. Open the DevIndex app grid.
2. Scroll to a row with a user who has GitHub organizations.
3. Scroll quickly to a row where the user has NO GitHub organizations (field is `undefined`).
4. Observe that the cell incorrectly displays the organizations from the recycled component's previous state.

**Expected behavior**
The component should correctly clear its state when the incoming data field is undefined.

**Proposed Solution**
In `src/grid/column/Component.mjs`, convert `undefined` values to `null` before passing them to `component.set()`. This explicitly forces the change detection to clear the state without requiring developers to manually handle this in every `applyRecordConfigs` extension.

## Timeline

- 2026-02-24T09:58:39Z @tobiu added the `bug` label
- 2026-02-24T09:58:39Z @tobiu added the `ai` label
- 2026-02-24T09:58:39Z @tobiu added the `core` label
- 2026-02-24T09:58:40Z @tobiu added the `grid` label
- 2026-02-24T09:59:48Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-24T10:01:53Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully implemented the fix. 
> 
> The `src/grid/column/Component.mjs` has been updated with a fast `for...in` loop that converts `undefined` configuration values into `null` when updating an existing (recycled) component instance. This ensures that when a new record scrolls into view that lacks a specific data field, the corresponding reactive config will explicitly clear its state instead of ignoring the `undefined` input and retaining the old record's data.
> 
> The fix was made carefully to preserve the O(1) performance requirement of horizontal scrolling by avoiding any new object allocations (`Object.entries`, etc.) inside the cell rendering hotpath. It also handles the `hideMode` defaults correctly.
> 
> I have added an intent-driven comment directly to the source code to ensure the architectural rationale is preserved for the Knowledge Base.

- 2026-02-24T10:02:45Z @tobiu referenced in commit `e5a31e6` - "fix(grid): Prevent stale state in pooled component columns (#9286)"
- 2026-02-24T10:03:03Z @tobiu closed this issue

