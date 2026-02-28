---
id: 9307
title: Resolve naming clash for Icon/IconLink column iconCls
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-26T13:32:06Z'
updatedAt: '2026-02-26T13:37:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9307'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T13:37:25Z'
---
# Resolve naming clash for Icon/IconLink column iconCls

**Problem:**
When using `Icon` or `IconLink` column types in a grid, configuring an `iconCls` for the cell icons inadvertently overwrites the column header's sorting arrow icon. This is because the grid container uses the column's configuration object to instantiate both the cell components and the header buttons.

**Proposed Solution:**
Introduce a new config `cellIconCls` specifically for the cell-level components, allowing `iconCls` to remain the domain of the header button (if desired).

- `src/grid/column/IconLink.mjs`: Replace `iconCls` config with `cellIconCls`. Update `applyRecordConfigs` to map `cellIconCls` to `iconCls` for the underlying `Neo.component.IconLink`.
- `src/grid/column/Icon.mjs`: Replace `iconCls` config with `cellIconCls`. Update `applyRecordConfigs` to map `cellIconCls` to `iconCls` for the underlying `Neo.component.Icon`.
- `apps/devindex/view/home/GridContainer.mjs`: Update configurations to use `cellIconCls` instead of `iconCls`.

## Timeline

- 2026-02-26T13:32:07Z @tobiu added the `bug` label
- 2026-02-26T13:32:07Z @tobiu added the `ai` label
- 2026-02-26T13:36:40Z @tobiu referenced in commit `51ed988` - "fix(grid): Resolve naming clash for Icon/IconLink column iconCls (#9307)"
### @tobiu - 2026-02-26T13:36:53Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the change across both the components (`Neo.component.Icon`, `Neo.component.IconLink`) and the grid column definitions (`Neo.grid.column.Icon`, `Neo.grid.column.IconLink`), renaming the config from `iconCls` to `cellIconCls`. The `GridContainer` inside DevIndex has also been updated. The changes have been pushed to the `dev` branch.

- 2026-02-26T13:36:58Z @tobiu assigned to @tobiu
- 2026-02-26T13:37:25Z @tobiu closed this issue

