---
id: 9608
title: Fix Event Resolution and Parent Hierarchy Regressions in Nested Sub-Grids
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-31T10:43:00Z'
updatedAt: '2026-03-31T10:47:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9608'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T10:47:12Z'
---
# Fix Event Resolution and Parent Hierarchy Regressions in Nested Sub-Grids

When transitioning to the Multi-Body grid architecture, explicit `parentId` injections were removed from `GridContainer.beforeSetBody` and `GridContainer.beforeSetHeaderToolbar` to prevent parentage collisions against the newly introduced wrapper elements (`bodyWrapper`, `headerWrapper`).

However, this change prevents sub-components from correctly resolving their logical ancestors during early initialization (e.g., inside `processConfigs`), causing two specific regressions:

1. **`TypeError: Cannot read properties of undefined (reading 'apply')`:**
   Event bindings mapped via strings (e.g., `listeners: { isScrollingChange: 'onGridIsScrollingChange' }`) fail to resolve because `getController()` relies on traversing `this.parent` upwards. During early instantiation, `this.parent` is null, causing `cb.fn` to become `undefined` and throwing an exception upon event firing.

2. **`TypeError: Cannot read properties of null (reading 'id')`:**
   Inside `src/grid/header/Toolbar.mjs`, `createSortZone` unconditionally attempts to read `me.parent.id` for its `boundaryContainerId` mapping. 

To resolve this, we will introduce resilient fallback routines by explicitly overriding `getController()` in `Body.mjs` and `Toolbar.mjs` to traverse `this.gridContainer` when `this.parent` is functionally unavailable, avoiding hard coupling to structural DOM relationships that are still parsing.

## Timeline

- 2026-03-31T10:43:02Z @tobiu added the `bug` label
- 2026-03-31T10:43:02Z @tobiu added the `ai` label
- 2026-03-31T10:43:02Z @tobiu added the `grid` label
- 2026-03-31T10:46:56Z @tobiu referenced in commit `5890988` - "fix: Restore native parentage resolution and prevent item null crashes (#9608)"
### @tobiu - 2026-03-31T10:47:07Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Resolved. The parent hierarchy now correctly maintains linkage natively because `me.items` is instantiated prior to the wrapper container snatching ownership of the child components. This correctly satisfies the `Container.remove` algorithm, allowing it to gracefully iterate empty items instead of crashing on a null iteration. Controller lookups correctly climb the object graph dynamically.

- 2026-03-31T10:47:10Z @tobiu assigned to @tobiu
- 2026-03-31T10:47:12Z @tobiu closed this issue

