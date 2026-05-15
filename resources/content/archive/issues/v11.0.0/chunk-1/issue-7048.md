---
id: 7048
title: 'Epic: Refactor and Enhance the Email App'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2025-07-14T14:05:01Z'
updatedAt: '2025-10-27T02:58:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7048'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 7049 Phase 1: Foundation and Basic Layout'
  - '[x] 7051 Task: Refactor MainView Styles to SCSS'
  - '[x] 7052 Phase 2: Email List View'
  - '[x] 7056 Phase 4: Compose Email Functionality'
  - '[x] 7058 Email.view.ComposeView: use a scss file and polish the internal code'
subIssuesCompleted: 5
subIssuesTotal: 5
blockedBy: []
blocking: []
closedAt: '2025-10-27T02:58:08Z'
---
# Epic: Refactor and Enhance the Email App

## Summary

Overhaul the existing `apps/email` to be a showcase application for the new functional component architecture and the framework's multi-window capabilities. The goal is to create a simplified, client-side-only version of a modern email client like Gmail.

## Rationale

A well-built, real-world example application is one of the most effective tools for driving framework adoption. The Email App is a perfect candidate to demonstrate:

-   **Modern Component-Based UI:** How to build a complex application using the new declarative functional components.
-   **State Management:** How to manage application state effectively in a functional context.
-   **Advanced Features:** How to leverage unique Neo.mjs features like multi-window support for a superior user experience.
-   **Best Practices:** Establish a reference architecture for building new applications with Neo.mjs.

This will serve as a powerful learning resource and a compelling demonstration of why developers should choose Neo.mjs.

## Key Features to Implement

1.  **Component Structure:**
    -   Refactor the entire UI to use functional components (`defineComponent`).
    -   Create a clear, hierarchical component structure (e.g., `MainContainer`, `EmailList`, `EmailDetails`, `ComposeOverlay`).

2.  **Basic Email Client UI:**
    -   Three-pane layout: Folders/Labels list, Email list, and selected Email detail view.
    -   Use dummy/mock data for emails (e.g., from a JSON file).

3.  **Compose and Reply:**
    -   "Compose" button opens a "New Email" view.
    -   This view should initially be an overlay/dialog at the bottom right of the main application window.

4.  **Multi-Window Experience:**
    -   The "Compose Email" overlay will have a "detach" button.
    -   Clicking "detach" will move the compose view from the overlay into its own separate browser window or tab, allowing the user to continue writing their email there seamlessly.
    -   The state of the email (recipient, subject, body) must be perfectly preserved during this transition.

## Acceptance Criteria

-   The `apps/email` codebase is primarily based on functional components.
-   The application presents a clean, modern, three-pane email client UI.
-   The "Compose" functionality works as described, starting in an overlay.
-   The "detach" feature successfully moves the compose view to a new window without losing state.
-   The application is well-documented and serves as a high-quality example for the community.

## Timeline

- 2025-07-14T14:05:01Z @tobiu assigned to @tobiu
- 2025-07-14T14:05:03Z @tobiu added the `enhancement` label
- 2025-07-14T14:21:47Z @tobiu added sub-issue #7049
- 2025-07-14T15:00:00Z @tobiu added sub-issue #7051
- 2025-07-14T15:47:27Z @tobiu added sub-issue #7052
- 2025-07-14T18:20:57Z @tobiu referenced in commit `146818c` - "#7048 Updated Epic plan"
- 2025-07-15T11:53:55Z @tobiu added sub-issue #7056
- 2025-07-15T13:29:55Z @tobiu added sub-issue #7058
### @github-actions - 2025-10-13T02:49:41Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-10-13T02:49:41Z @github-actions added the `stale` label
### @github-actions - 2025-10-27T02:58:07Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2025-10-27T02:58:08Z @github-actions closed this issue

