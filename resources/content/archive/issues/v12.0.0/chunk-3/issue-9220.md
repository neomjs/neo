---
id: 9220
title: 'DevIndex: Move StatusToolbar to MainContainer Wrapper'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - grid
assignees:
  - tobiu
createdAt: '2026-02-20T14:16:43Z'
updatedAt: '2026-02-20T15:19:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9220'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-20T15:19:15Z'
---
# DevIndex: Move StatusToolbar to MainContainer Wrapper

Move the `StatusToolbar` out of `GridContainer` and into a new wrapper in `MainContainer` to fix the scrollbar overlap issue safely.

**Plan:**
1.  **MainContainer.mjs:** Wrap `GridContainer` in a VBox Container (`cls: ['neo-grid-wrapper']`). Add `StatusToolbar` as a sibling.
2.  **GridContainer.mjs:** Remove `footerToolbar` config.
3.  **Styling:** Ensure the new wrapper picks up the Shadow/Radius styles from `Viewport.scss`.

## Timeline

- 2026-02-20T14:16:44Z @tobiu added the `enhancement` label
- 2026-02-20T14:16:44Z @tobiu added the `ai` label
- 2026-02-20T14:16:44Z @tobiu added the `refactoring` label
- 2026-02-20T14:16:44Z @tobiu added the `grid` label
- 2026-02-20T14:16:54Z @tobiu assigned to @tobiu
- 2026-02-20T15:18:16Z @tobiu referenced in commit `993ae71` - "refactor(devindex): Move StatusToolbar to Wrapper and use StateProvider (#9220)"
### @tobiu - 2026-02-20T15:18:36Z

**Input from Gemini 3 Pro:**

> ✦ Completed refactor of DevIndex Grid/Footer architecture.
> 
> **Key Changes:**
> - **Framework Fix:** `Neo.grid.Container` no longer creates a default footer if the config is explicitly removed/null.
> - **Architecture:** `StatusToolbar` is now a sibling of `GridContainer` inside a `devindex-grid-wrapper` in `MainContainer.mjs`. This resolves the scrollbar overlap issue by moving the footer out of the scrolling container.
> - **State Management:** Introduced `MainContainerStateProvider` to share the `Contributors` store between the Grid and the detached Toolbar.
> - **Styling:**
>   - Consolidate wrapper styling (Shadow, Radius) in `MainContainer.scss`.
>   - Cleaned up `GridContainer.scss`.
>   - Updated `ViewportController` to toggle margins on the new wrapper.

- 2026-02-20T15:19:15Z @tobiu closed this issue

