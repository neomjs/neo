---
id: 7051
title: 'Task: Refactor MainView Styles to SCSS'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-14T14:59:58Z'
updatedAt: '2025-07-14T15:46:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7051'
author: tobiu
commentsCount: 0
parentIssue: 7048
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-14T15:46:41Z'
---
# Task: Refactor MainView Styles to SCSS

## Summary

Move all inline styles from the functional `apps/email/view/MainView.mjs` component into its dedicated stylesheet at `resources/scss/src/apps/email/MainView.scss`.

## Rationale

Separating component structure (defined in JavaScript) from its presentation (defined in SCSS) is a core principle of maintainable web development. This change will:

-   Make the `MainView.mjs` component code cleaner and more focused on logic and structure.
-   Centralize all styling for the component in one place, making it easier to theme and modify.
-   Align the new functional component with the framework's established best practices for styling.

## Implementation Details

### Completed Work

1.  **File Creation:** The stylesheet `resources/scss/src/apps/email/MainView.scss` has been created.
2.  **Root Element Styling:** The styles for the root container (`display: flex`, etc.) have been moved into an `.email-mainview` class within the SCSS file.
3.  **Component Update:** The `MainView.mjs` component has been updated to use the `cls: ['email-mainview']` config to apply these styles.

### To-Do

1.  **Refactor Pane Styles:** The `paneStyle` object, which defines the `border`, `margin`, and `padding` for the three panes, is still defined inline within `createVdom()`.
2.  **Create SCSS Class:** Create a new class (e.g., `.email-mainview-pane`) in `MainView.scss` for these styles.
3.  **Apply Class in VDOM:** Update the `createVdom()` method in `MainView.mjs` to apply this new class to the three pane nodes instead of using the inline `style` object.

## Acceptance Criteria

-   The `paneStyle` object is completely removed from `MainView.mjs`.
-   The styles for the panes are defined in `MainView.scss` under a dedicated class.
-   The visual appearance of the `MainView` component remains identical to the previous implementation.

## Timeline

- 2025-07-14T14:59:59Z @tobiu assigned to @tobiu
- 2025-07-14T15:00:00Z @tobiu added the `enhancement` label
- 2025-07-14T15:00:00Z @tobiu added parent issue #7048
- 2025-07-14T15:01:39Z @tobiu referenced in commit `1679983` - "Task: Refactor MainView Styles to SCSS #7051"
- 2025-07-14T15:46:41Z @tobiu closed this issue

