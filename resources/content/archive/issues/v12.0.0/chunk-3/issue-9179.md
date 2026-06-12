---
id: 9179
title: 'DevIndex: Introduce StateProvider for animateVisuals'
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees: []
createdAt: '2026-02-16T01:07:55Z'
updatedAt: '2026-02-16T02:14:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9179'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-16T02:14:38Z'
---
# DevIndex: Introduce StateProvider for animateVisuals

To fix a regression where `animateVisuals` state is lost or listeners are not attached due to lazy loading of the Grid, we will introduce a `Neo.state.Provider`.

1.  **Create** `apps/devindex/view/ViewportStateProvider.mjs` with `animateVisuals: true`.
2.  **Add** the provider to `DevIndex.view.Viewport`.
3.  **Bind** `GridContainer`'s `animateVisuals` config to the state provider: `bind: {animateVisuals: data => data.animateVisuals}`.
4.  **Update** `MainContainerController` (checkbox) to write to the state provider instead of the grid directly.
5.  **Update** `ViewportController` to listen to the state provider changes to update the `HeaderCanvas` pulse effect, removing the direct dependency on the Grid component.


## Timeline

- 2026-02-16T01:07:55Z @tobiu added the `bug` label
- 2026-02-16T01:07:55Z @tobiu added the `ai` label
- 2026-02-16T01:07:56Z @tobiu added the `refactoring` label
- 2026-02-16T02:13:45Z @tobiu referenced in commit `5c201c1` - "refactor(devindex): Implement StateProvider for Viewport state management (#9179)"
### @tobiu - 2026-02-16T02:13:53Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> 
> **Summary of Changes:**
> 1.  **State Provider:** Introduced `DevIndex.view.ViewportStateProvider` to manage `animateVisuals` and `isScrolling` state globally for the Viewport.
> 2.  **Decoupling:** Removed imperative event listeners from `ViewportController`, solving the regression where lazy-loaded components (Grid) were missed during initialization.
> 3.  **Bridge Pattern:** `DevIndex.view.HeaderToolbar` now acts as a bridge, binding to the State Provider and declaratively updating the `HeaderCanvas` renderer via `afterSet` hooks.
> 4.  **Grid Integration:** `GridContainer` now binds to `animateVisuals` and pushes `isScrolling` state to the provider, ensuring the header animation reacts to grid interactions regardless of component lifecycle.
> 5.  **State Logic:** State mutations (`onShowAnimationsChange` and `onGridIsScrollingChange`) are centralized in `MainContainerController`.
> 
> The architecture is now more robust, leveraging Neo.mjs State Providers for clean, persistent state management across lazy-loaded views.

- 2026-02-16T02:14:38Z @tobiu closed this issue

