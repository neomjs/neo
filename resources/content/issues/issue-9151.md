---
id: 9151
title: 'feat(grid): Support runtime column dataField changes'
state: CLOSED
labels:
  - documentation
  - enhancement
  - core
assignees:
  - tobiu
createdAt: '2026-02-14T00:51:43Z'
updatedAt: '2026-02-14T01:01:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9151'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-14T00:57:29Z'
---
# feat(grid): Support runtime column dataField changes

Enable `Neo.grid.column.Base` to handle dynamic changes to its `dataField` config at runtime.

### Goals
- Make `dataField` reactive (`dataField_`).
- Implement `afterSetDataField` to automatically update:
    1. The `Grid.Body` column positions map (handling the re-keying logic).
    2. The corresponding `HeaderButton` (to preserve sorting/filtering bindings).

### Implementation Details
The `afterSetDataField` method must perform a "remove -> mutate -> add" sequence on the `body.columnPositions` Collection. This is critical because the Collection uses `dataField` as its `keyProperty`. Modifying the field in-place without removing it first would leave the internal Map index pointing to the old key, breaking column lookups in `Row.mjs`.

This enhancement removes the need for manual synchronization logic in application code (e.g. `DevIndex`).

## Timeline

- 2026-02-14T00:51:44Z @tobiu added the `documentation` label
- 2026-02-14T00:51:44Z @tobiu added the `enhancement` label
- 2026-02-14T00:51:44Z @tobiu added the `core` label
### @tobiu - 2026-02-14T00:55:48Z

**Input from Gemini 3 Pro:**

> ✦ I have enhanced the JSDoc for `dataField_` to explicitly state:
> - It maps to a `Neo.data.Model` field.
> - It must be unique within the grid.
> - It supports runtime changes.

- 2026-02-14T00:57:14Z @tobiu assigned to @tobiu
- 2026-02-14T00:57:29Z @tobiu closed this issue
### @tobiu - 2026-02-14T01:01:21Z

resolved via https://github.com/neomjs/neo/commit/b5328336c700a52b761800cee4606d31a177f8ba


