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

## Phase 2: Email List View (Completed)

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


---

## Phase 3: Email Detail View (Completed)

**Goal:** Display the content of a selected email from the grid.

**Sub-Tasks:**

1.  **Grid Selection:**
    -   Configured a `selection.RowModel` on the grid's `bodyConfig`.
    -   Set `singleSelect: true` to allow only one row to be selected.
2.  **State Management:**
    -   Used the `useConfig()` hook in `MainView` to create a `selectedEmail` state variable.
3.  **Event Handling:**
    -   Added a `selectionChange` listener to the selection model.
    -   The listener updates the `selectedEmail` state with the selected record.
4.  **Detail View:**
    -   The "Email Details" pane now conditionally renders the `title`, `sender`, and `content` of the `selectedEmail`.
    -   If no email is selected, it displays a placeholder message.

**Next Steps:**
-   Implement "Compose" functionality.


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
