---
id: 7056
title: 'Phase 4: Compose Email Functionality'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-15T11:53:54Z'
updatedAt: '2025-07-15T11:54:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7056'
author: tobiu
commentsCount: 0
parentIssue: 7048
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-15T11:54:55Z'
---
# Phase 4: Compose Email Functionality

**Reported by:** @tobiu on 2025-07-15

---

**Parent Issue:** #7048 - Epic: Refactor and Enhance the Email App

---

**Goal:** Implement the ability to compose a new email, initially within the main window.

**Proposed Plan:**
1.  **Compose Button:** Add a `Neo.button.Base` to the "Folders" pane.
2.  **State Management:** Use `useConfig` in `MainView` to manage an `isComposing` boolean state.
3.  **Compose View:** Create a new functional component, `view/ComposeView.mjs`, containing the form for the new email.
4.  **Conditional Rendering:** Use the `isComposing` flag to conditionally render the `ComposeView` as an overlay on top of the main view.
5.  **Event Handling:** The "Compose" button will set `isComposing` to `true`. The `ComposeView` will have a "Close" button that sets it back to `false`.
6.  **Overlay Implementation:** We will build a custom functional overlay for this, as it's a good exercise and provides maximum flexibility.

