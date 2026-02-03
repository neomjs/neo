---
id: 8964
title: 'RFC: Component-Based Grid Rows (Neo.grid.Row) for Granular Updates'
state: OPEN
labels:
  - enhancement
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-02-03T13:44:03Z'
updatedAt: '2026-02-03T13:50:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8964'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# RFC: Component-Based Grid Rows (Neo.grid.Row) for Granular Updates

## Current Architecture
Currently, `Neo.grid.Body` acts as a monolithic renderer. It manages a large VDOM structure representing all visible rows.
- **Rendering:** `createViewData` iterates through the store and generates a massive array of VDOM objects for rows and cells.
- **Updates:** When a single record changes (`onStoreRecordChange`), `grid.Body` often triggers a full `update()`, sending the entire grid body VDOM to the worker (though diffing minimizes DOM ops, the serialization/transport cost is O(N)).
- **Component Columns:** `grid.Body` manually instantiates, updates, and destroys components (like Sparklines) within cells, managing their lifecycle via custom logic (`cellRenderer`, `cleanupComponentInstances`).

## The Proposal: `Neo.grid.Row`
Refactor the Grid to use a "Composed Architecture" where each row is a `Neo.component.Base` instance.

### Core Concepts
1.  **Row Component:** Create a new class `Neo.grid.Row` extending `Neo.component.Base`.
    -   **Configs:** `record`, `columns`, `rowIndex`, `gridContainer`.
    -   **Reactivity:** `afterSetRecord` triggers a VDOM update for *only* that row instance.
2.  **Row Pooling:** `Neo.grid.Body` maintains a fixed pool of `Neo.grid.Row` instances (based on `availableRows` + buffer).
    -   **Scrolling:** Instead of regenerating VDOM objects, `grid.Body` updates the configs of existing Row components (`row.set({ record: newRecord, rowIndex: newIndex })`).
3.  **Container Composition:** `grid.Body` manages these rows as standard `items`.

### Benefits
1.  **Granular Updates (O(1)):** A record update triggers a VDOM update *only* for the specific `Neo.grid.Row` instance. The parent `grid.Body` does not need to re-render or diff the entire table.
2.  **Simplified Lifecycle:** Component columns (Sparklines, Widgets) become standard children of the `Row` component. Their lifecycle (mount/unmount) is handled automatically by the framework's standard component tree logic, removing the fragile manual management in `grid.Body`.
3.  **Cleaner Architecture:** Separation of concerns. `grid.Body` manages the *viewport* and *scrolling*. `grid.Row` manages the *content* and *cell rendering*.
4.  **Stability:** Eliminates "Zombie Canvas" and context-loss bugs caused by manual VDOM manipulation, as the framework ensures component state persistence.

### Challenges / Considerations
1.  **Memory Overhead:** Creating ~50 component instances vs raw VDOM objects. (Deemed negligible for modern apps).
2.  **Initial Render:** Instantiation time for the row pool.
3.  **Refactoring:** Significant changes to `Neo.grid.Body`, `Neo.grid.column.Base` (renderers might need adjustment), and CSS targeting (ensuring `Neo.grid.Row` renders the correct class/structure).

### Implementation Strategy
1.  **Prototype `Neo.grid.Row`:** Create the class and ensure it can render a record given a set of columns.
2.  **Refactor `Neo.grid.Body`:**
    -   Remove `createRow` VDOM generation.
    -   Implement `createRowPool` to instantiate components.
    -   Update `onStoreRecordChange` to find the matching Row component and call `set()`.
    -   Update scrolling logic to recycle Row components instead of VDOM nodes.

### Future Potential
-   **Drag & Drop:** Row reordering becomes standard component drag-and-drop.
-   **Row Expansion:** Implementing "Row Expander" (nested grids/details) becomes trivial (just adding items to the Row component).


## Timeline

- 2026-02-03T13:44:04Z @tobiu added the `enhancement` label
- 2026-02-03T13:44:04Z @tobiu added the `epic` label
- 2026-02-03T13:44:04Z @tobiu added the `ai` label
- 2026-02-03T13:44:05Z @tobiu added the `architecture` label
- 2026-02-03T13:44:30Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-03T13:50:43Z

**Input from Gemini 3 Pro:**

> ✦ **Critical Architecture Note: Dynamic Column Handling & Performance**
> 
> It is vital to clarify that `Neo.grid.Row` cannot effectively manage its own structure in isolation. A row's structure (cell order, visibility, renderers) is strictly dependent on the `Grid.Container`'s column configuration, which is mutable at runtime.
> 
> **Responsibility:**
> The `Grid.Body` (or `Container`) **MUST** remain the authority on defining the Row VDOM structure.
> 
> **Implementation Constraint:**
> We must avoid a design where every `Neo.grid.Row` instance independently listens to Grid events to rebuild itself. Instead, the `Grid.Body` should efficiently orchestrate structural updates.
> 
> **Performance Optimization (Batching):**
> When columns change (or during scrolling), updating 50+ row components individually could trigger significant traffic.
> Recommended pattern:
> 1.  `Grid.Body` iterates over the Row pool.
> 2.  Applies updates using `silentVdomUpdate: true` on each row to prevent immediate worker messages.
> 3.  Triggers a single, consolidated update from the `Grid.Body` (or utilizes the `VdomUpdate` manager's batching capabilities explicitly) to flush all changes in one go.
> This ensures the Grid updates atomically, preventing "tearing" artifacts and minimizing IPC overhead.


