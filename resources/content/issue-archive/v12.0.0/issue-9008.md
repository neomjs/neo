---
id: 9008
title: Refactor DevRank Grid components to use dedicated classes
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-06T00:35:59Z'
updatedAt: '2026-02-06T00:41:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9008'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-06T00:41:31Z'
---
# Refactor DevRank Grid components to use dedicated classes

The current implementation of the User and Location columns in `apps/devrank/view/GridContainer.mjs` uses an anti-pattern where the `component` config function returns a raw `vdom` object. This leads to `component.set({vdom: ...})` calls, which are problematic (stale state, ID loss).

The goal is to refactor these into dedicated component classes (`UserCell`, `LocationCell`) that manage their own VDOM updates reactively based on input configs. This will fix the stale rendering issues and align with proper Neo.mjs architectural patterns.

Tasks:
1. Revert debug logs in `src/grid/column/Component.mjs`.
2. Create `apps/devrank/view/cell/UserCell.mjs`.
3. Create `apps/devrank/view/cell/LocationCell.mjs`.
4. Update `apps/devrank/view/GridContainer.mjs` to use these new components.

## Timeline

- 2026-02-06T00:36:01Z @tobiu added the `ai` label
- 2026-02-06T00:36:01Z @tobiu added the `refactoring` label
- 2026-02-06T00:40:48Z @tobiu assigned to @tobiu
- 2026-02-06T00:41:00Z @tobiu referenced in commit `884a5ca` - "refactor(devrank): Replace inline VDOM components with reactive Cell classes (#9008)"
### @tobiu - 2026-02-06T00:41:15Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> 
> I have replaced the inline component definitions in `apps/devrank/view/GridContainer.mjs` with dedicated component classes:
> - `apps/devrank/view/cell/UserCell.mjs`
> - `apps/devrank/view/cell/LocationCell.mjs`
> 
> These components accept a `record` config and update their VDOM internally using `afterSetRecord`, ensuring that:
> 1.  `vdom` is never passed to `set()`, avoiding the stale state issue.
> 2.  Component IDs and internal state are preserved during updates.
> 3.  Updates are reactive and efficient.
> 
> The `GridContainer` code is now cleaner and follows best practices.

- 2026-02-06T00:41:31Z @tobiu closed this issue

