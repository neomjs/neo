---
id: 8812
title: Investigate and Implement Generic Fix for Phantom Mounts in Nested TabContainers
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-19T14:24:11Z'
updatedAt: '2026-01-19T14:36:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8812'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T14:36:25Z'
---
# Investigate and Implement Generic Fix for Phantom Mounts in Nested TabContainers

**Objective:**
Investigate and implement a generic, framework-level pattern to synchronize `TabContainer` state restoration with the Router to prevent "Phantom Mounts" of previously active tabs.

**Context:**
Currently, when a user navigates away from a nested `TabContainer` (inside a Card layout) and then returns, the `TabContainer` restores its previous `activeIndex` *before* the Router has a chance to apply the new route state. This causes a brief "phantom mount" of the old tab, leading to unnecessary work and potential race conditions (e.g., with `TimelineCanvas`).

**Current Workaround:**
In `apps/portal/view/news/TabContainer.mjs`, `afterSetMounted` is used to reset `activeIndex` to `null` on unmount.

**Goals:**
1.  Analyze the interaction between `Neo.tab.Container`, `Neo.layout.Card`, and `Neo.router`.
2.  Identify a generic way to defer state restoration or synchronize it with the Router.
3.  Implement the solution in the framework or provide a standard pattern.
4.  Remove the workaround from the Portal app.

**Key Files:**
-   `apps/portal/view/news/TabContainer.mjs`
-   `src/tab/Container.mjs`
-   `src/layout/Card.mjs`
-   `apps/portal/view/news/TabContainerController.mjs`

## Timeline

- 2026-01-19T14:24:12Z @tobiu added the `enhancement` label
- 2026-01-19T14:24:12Z @tobiu added the `ai` label
- 2026-01-19T14:24:12Z @tobiu added the `architecture` label
- 2026-01-19T14:35:46Z @tobiu referenced in commit `cc7def1` - "feat: Add resetActiveIndexOnUnmount config to Neo.tab.Container (#8812)

This introduces a generic mechanism to prevent 'phantom mounts' in router-driven
TabContainers. By setting this config to true, the activeIndex is automatically
reset to null when the component unmounts, ensuring it mounts in a clean state
awaiting the Router's instruction.

Updated Portal.view.news.TabContainer to use this new config instead of the
manual workaround."
### @tobiu - 2026-01-19T14:36:02Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the generic fix for the "Phantom Mount" issue.
> 
> **Changes:**
> 1.  **`src/tab/Container.mjs`**: Added a new config `resetActiveIndexOnUnmount` (default: `false`). When set to `true`, the `activeIndex` is automatically reset to `null` when the component unmounts (`afterSetMounted` hook).
> 2.  **`apps/portal/view/news/TabContainer.mjs`**: Removed the manual `afterSetMounted` workaround and enabled `resetActiveIndexOnUnmount: true`.
> 
> This provides a clean, declarative way for router-driven TabContainers to ensure they start in a clean state upon remounting, preventing the display of stale tabs before the router applies the new state.

- 2026-01-19T14:36:12Z @tobiu assigned to @tobiu
- 2026-01-19T14:36:25Z @tobiu closed this issue
- 2026-01-19T14:49:42Z @tobiu cross-referenced by #8813

