# EPIC: Refactor and Enhance the Email App

This document outlines the plan for refactoring the `apps/email` application into a showcase for the Neo.mjs functional component architecture and multi-window capabilities.

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


---

## Phase 2: Email List View

**Goal:** Implement the email list pane using a Neo.mjs grid to display a list of emails.

**Potential Tools to Explore:**

-   `src/grid/Base.mjs`: For a powerful, feature-rich data grid.
-   `src/list/Base.mjs`: For a simpler list view if a full grid is not needed initially.
-   `src/data/Store.mjs`: To manage the email data.
-   `src/collection/Base.mjs`: For sorting and filtering capabilities within the store.

**Sub-Tasks:**
*(To be defined)*

---

## Phase 3: Email Detail View

**Goal:** Display the content of a selected email.

**Sub-Tasks:**
*(To be defined)*

---

## Phase 4: Compose Email Functionality

**Goal:** Implement the ability to compose a new email, initially within the main window.

**Potential Tools to Explore:**

-   `src/dialog/Base.mjs`: To create a modal or non-modal dialog for the compose window.
-   Custom Functional Overlay: Build a new overlay component from scratch using functional components.

**Sub-Tasks:**
*(To be defined)*

---

## Phase 5: Multi-Window Detach

**Goal:** Implement the "detach" functionality to move the compose view into a separate browser window.

**Sub-Tasks:**
*(To be defined)*
