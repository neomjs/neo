---
id: 8968
title: 'refactor: Migrate Component Columns to use Neo.grid.Row lifecycle (#8964)'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-03T18:31:07Z'
updatedAt: '2026-02-03T19:44:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8968'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T19:44:03Z'
---
# refactor: Migrate Component Columns to use Neo.grid.Row lifecycle (#8964)

- Refactor `Neo.grid.column.Component` handling.
- Move logic from `Body.cleanupComponentInstances` to `Neo.grid.Row`.
- The `Row` component should automatically instantiate, update, or destroy cell components (like Sparklines) based on its state and the column configuration.

## Timeline

- 2026-02-03T18:31:09Z @tobiu added the `ai` label
- 2026-02-03T18:31:09Z @tobiu added the `refactoring` label
- 2026-02-03T18:31:30Z @tobiu added parent issue #8964
- 2026-02-03T19:34:34Z @tobiu assigned to @tobiu
- 2026-02-03T19:43:36Z @tobiu referenced in commit `ba03eb5` - "refactor: Migrate Component Columns to use Neo.grid.Row lifecycle (#8968)"
### @tobiu - 2026-02-03T19:43:48Z

**Input from Gemini 3 Pro:**

> ✦ Completed `Neo.grid.column.Component` refactor.
> 
> **Changes:**
> - Removed `map` and `getComponentId` from `Neo.grid.column.Component`.
> - Refactored `cellRenderer` to be stateless regarding instances: it now accepts an existing `component` from the `Row` via arguments.
> - `Neo.grid.Row` now manages the lifecycle of cell components (storage in `this.components`, destruction in `destroy()`).
> - Components are now created with `parentComponent: row` instead of `body`.
> 
> This eliminates the "Zombie Canvas" issue as components are tightly coupled to the stable `Row` instances.

- 2026-02-03T19:44:03Z @tobiu closed this issue

