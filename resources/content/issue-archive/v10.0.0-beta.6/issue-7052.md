---
id: 7052
title: 'Phase 2: Email List View'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-14T15:47:25Z'
updatedAt: '2025-07-14T16:08:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7052'
author: tobiu
commentsCount: 0
parentIssue: 7048
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-14T16:08:54Z'
---
# Phase 2: Email List View

**Goal:** Implement the email list pane using a Neo.mjs grid to display a list of emails.

**Sub-Tasks:**

1.  **Create Mock Data:**
    -   Populated the `apps/email/store/Emails.mjs` with hardcoded sample email data.
2.  **Integrate Grid:**
    -   Replaced the "Email List" placeholder in `MainView.mjs` with a `Neo.grid.Container`.
    -   Configured the grid to use the `Emails` store and defined the columns.
3.  **Styling & Layout:**
    -   Wrapped the grid in a styled `div` to ensure correct flexbox layout.
    -   Used the `wrapperStyle` config on the grid to control its internal dimensions, which is necessary for the grid's layout engine.
4.  **Enable Interoperability:**
    -   Enhanced `functional.component.Base` to propagate the parent's `windowId` to all child components. This was a critical fix to ensure the classic grid component could function correctly when rendered inside our functional `MainView`.

**Learnings & Decisions:**

-   **Complex Component Integration:** Integrating a complex classic component like `grid.Container` into a functional component requires more than just placing it in the VDOM. We must provide layout-critical styles (like `height` and `width`) via the component's specific config (`wrapperStyle`) for it to render correctly.
-   **`windowId` is Crucial:** The `windowId` must be manually propagated from functional parents to classic children. This is a fundamental requirement for interoperability and ensuring that events, theming, and other window-specific functionalities work correctly. This led to enhancing `functional.component.Base` and creating a dedicated ticket for it.

**Next Steps:**
-   Implement selection handling on the grid to prepare for the detail view.

## Timeline

- 2025-07-14T15:47:26Z @tobiu assigned to @tobiu
- 2025-07-14T15:47:27Z @tobiu added the `enhancement` label
- 2025-07-14T15:47:27Z @tobiu added parent issue #7048
- 2025-07-14T15:53:12Z @tobiu referenced in commit `7e70ab9` - "Phase 2: Email List View #7052"
- 2025-07-14T16:08:54Z @tobiu closed this issue

