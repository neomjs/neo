---
id: 7049
title: 'Phase 1: Foundation and Basic Layout'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-14T14:21:46Z'
updatedAt: '2025-07-14T14:57:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7049'
author: tobiu
commentsCount: 0
parentIssue: 7048
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-14T14:57:44Z'
---
# Phase 1: Foundation and Basic Layout

## Phase 1: Foundation and Basic Layout (Completed)

**Goal:** Implement the main 3-pane layout as a functional `MainView` component and set it as the content of the existing classic `Viewport`.

**Sub-Tasks:**

1.  **Create `view/MainView.mjs`:**
    -   Used `defineComponent` to create a new functional component.
    -   Implemented a flexbox-based 3-pane layout (Folders, Email List, Email Detail).
2.  **Update `view/Viewport.mjs`:**
    -   Configured the `Viewport` with `layout: 'fit'`.
    -   Replaced the old `TabContainer` with the new `MainView` component as its single item.
3.  **Cleanup:**
    -   Removed the `stateProvider` from the `Viewport` as it is not currently needed.

**Learnings & Decisions:**

-   **Interoperability:** Decided to keep the classic `Viewport` and embed the new functional `MainView` component within it. This is a pragmatic approach that leverages existing structures and showcases the interoperability between classic and functional components.
-   **Naming:** Renamed the main functional component from `Main.mjs` to `MainView.mjs` for better clarity and to align with the `mainView` config in `app.mjs`.

## Timeline

- 2025-07-14T14:21:46Z @tobiu assigned to @tobiu
- 2025-07-14T14:21:47Z @tobiu added the `enhancement` label
- 2025-07-14T14:21:47Z @tobiu added parent issue #7048
- 2025-07-14T14:22:20Z @tobiu referenced in commit `dcc6f58` - "Phase 1: Foundation and Basic Layout #7049"
- 2025-07-14T14:57:44Z @tobiu closed this issue

