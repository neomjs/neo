# EPIC: Refactor and Enhance the Email App

This document outlines the plan for refactoring the `apps/email` application into a showcase for the Neo.mjs functional component architecture and multi-window capabilities.

## Architectural Milestones & Key Learnings

This epic has driven significant architectural improvements to the functional component system. For a full understanding of the current state, review this ticket:

-   **[#ticket-functional-recursive-config-diffing.md](/.github/ticket-functional-recursive-config-diffing.md):** A plan for a future enhancement to make the diffing logic recursive, allowing for deep, declarative control over nested component configurations.

---

## Phase 1: Foundation and Basic Layout (Completed)

**Goal:** Implement the main 3-pane layout as a functional `MainView` component and set it as the content of the existing classic `Viewport`.

**Learnings & Decisions:**
-   **Interoperability:** Kept the classic `Viewport` and embedded the new functional `MainView` component, showcasing seamless integration.
-   **Naming:** Renamed `Main.mjs` to `MainView.mjs` for clarity.

---

## Phase 2: Email List View (Completed)

**Goal:** Implement the email list pane using a `Neo.grid.Container`.

**Learnings & Decisions:**
-   **Complex Component Integration:** Discovered that complex classic components require specific configs (e.g., `wrapperStyle`) to manage their own layout when nested inside functional components.
-   **Stateful Child Problem:** Uncovered the core issue of stateful children (stores, columns) being re-created on every parent render. This led directly to the architectural work on VDOM diffing.

---

## Phase 3: Email Detail View (Completed)

**Goal:** Display the content of a selected email from the grid.
-   Implemented a `selection.RowModel` on the grid and used a `useConfig` state variable (`selectedEmail`) to drive a conditional render of the detail pane.

---

## Phase 4: Compose Email Functionality (Next)

**Goal:** Implement the ability to compose a new email, initially within the main window.

**Proposed Plan:**
1.  **Compose Button:** Add a `Neo.button.Base` to the "Folders" pane.
2.  **State Management:** Use `useConfig` in `MainView` to manage an `isComposing` boolean state.
3.  **Compose View:** Create a new functional component, `view/ComposeView.mjs`, containing the form for the new email.
4.  **Conditional Rendering:** Use the `isComposing` flag to conditionally render the `ComposeView` as an overlay on top of the main view.
5.  **Event Handling:** The "Compose" button will set `isComposing` to `true`. The `ComposeView` will have a "Close" button that sets it back to `false`.
6.  **Overlay Implementation:** We will build a custom functional overlay for this, as it's a good exercise and provides maximum flexibility.

---

## Phase 5: Multi-Window Detach

**Goal:** Implement the "detach" functionality to move the compose view into a separate browser window.
**Sub-Tasks:** *(To be defined)*

