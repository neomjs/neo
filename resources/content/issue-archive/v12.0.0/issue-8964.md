---
id: 8964
title: 'RFC: Component-Based Grid Rows (Neo.grid.Row) for Granular Updates'
state: CLOSED
labels:
  - enhancement
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-02-03T13:44:03Z'
updatedAt: '2026-02-04T14:05:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8964'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues:
  - '[x] 8965 feat: Create Neo.grid.Row component (#8964)'
  - '[x] 8966 refactor: Upgrade Neo.grid.Body to Container and implement Row Pooling (#8964)'
  - '[x] 8967 feat: Implement Reactive Record Updates in Neo.grid.Row (#8964)'
  - '[x] 8968 refactor: Migrate Component Columns to use Neo.grid.Row lifecycle (#8964)'
  - '[x] 8969 perf: Implement Batching and Silent Updates for Grid Scrolling (#8964)'
  - '[x] 8970 feat: Commit base implementation of Neo.grid.Row and refactored GridBody (#8964)'
  - '[x] 8971 fix: Enable horizontal scrolling by forcing Row VDOM updates on column mount change (#8964)'
  - '[x] 8973 fix: Component Columns disappear after horizontal scroll due to stale mounted state (#8964)'
  - '[x] 8974 refactor: Cleanup Neo.grid.Body and optimize Row/Body responsibilities (#8964)'
  - '[x] 8975 Fix Grid Header Drag Proxy for Row Component Architecture'
  - '[x] 8976 Fix Grid Cell Animations During Column Reordering'
  - '[x] 8977 Implement Surgical DOM Move for Component Columns in Drag Proxy'
  - '[x] 8978 Refactor Selection Models: Phase 1 (Base & Row)'
  - '[x] 8979 Refactor Selection Models: Phase 2 (Cell & Column)'
  - '[x] 8984 Fix Grid Row Reactivity & AnimatedChange Column for In-Place Updates'
  - '[x] 8985 refactor: Add getRow helper to GridBody'
  - '[x] 8986 docs: Knowledge Base Enhancement Strategy for Grid Classes (#8964)'
subIssuesCompleted: 17
subIssuesTotal: 17
blockedBy: []
blocking: []
closedAt: '2026-02-04T14:05:38Z'
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

### @tobiu - 2026-02-03T18:05:00Z

**Input from Gemini 3 Pro:**

> ✦ I have analyzed the RFC and the codebase. This is a transformative refactor.
> 
> Here is the proposed breakdown of sub-tickets to tackle Epic #8964.
> 
> ### **Phase 1: Foundation**
> 
> **1. Scaffold `Neo.grid.Row` Component**
>    - **Goal:** Create the `Neo.grid.Row` class.
>    - **Scope:**
>      - Create `src/grid/Row.mjs` extending `Neo.component.Base`.
>      - Migrate the cell rendering logic (HTML/Text cells) from `Body.createRow` to `Row.mjs`.
>      - Define configs: `record`, `rowIndex`, `columns` (passed from Body).
>      - **Deliverable:** A Row component that can generate its own VDOM for standard cells.
> 
> **2. Refactor `Neo.grid.Body` to use Row Pooling**
>    - **Goal:** Replace monolithic VDOM generation with a pool of Row components.
>    - **Scope:**
>      - **Architectural Decision:** Should `Neo.grid.Body` be upgraded to extend `Neo.container.Base` to natively handle `items`? Or should we manually manage the lifecycle of Row components within `Component` to avoid Layout overhead? (RFC implies "standard items", suggesting `Container`).
>      - Implement `createRowPool(size)` to instantiate `Neo.grid.Row` instances.
>      - Update `createViewData` and `updateMountedAndVisibleRows` to recycle these instances (`row.set({record, rowIndex})`) instead of creating raw VDOM.
>      - **Deliverable:** The Grid renders using `Neo.grid.Row` instances.
> 
> ### **Phase 2: Reactivity & Features**
> 
> **3. Implement Granular Updates (Data Binding)**
>    - **Goal:** Enable O(1) updates for single record changes.
>    - **Scope:**
>      - Refactor `Body.onStoreRecordChange`.
>      - Remove manual VDOM manipulation (`updateCellNode`).
>      - Logic: Find the matching `Row` instance $\rightarrow$ call `row.set({record})` $\rightarrow$ Row updates its own VDOM.
>      - **Deliverable:** Editing a record updates only that Row's VDOM.
> 
> **4. Migrate Component Columns (The "Zombie Canvas" Fix)**
>    - **Goal:** Move component cell management to the Row.
>    - **Scope:**
>      - Refactor `Neo.grid.column.Component`.
>      - Move `cleanupComponentInstances` logic from Body to Row.
>      - `Row` automatically instantiates/destroys cell components (like Sparklines) based on its state.
>      - **Deliverable:** Sparklines/Widgets work inside the new Row architecture.
> 
> ### **Phase 3: Optimization**
> 
> **5. Performance: Batching & Silent Updates**
>    - **Goal:** Ensure scrolling performance matches or exceeds the current implementation.
>    - **Scope:**
>      - Implement `silentVdomUpdate: true` for Row updates during scroll.
>      - Implement the batch flush in `Grid.Body` (as noted in the RFC).
>      - Benchmarking.

- 2026-02-03T18:31:24Z @tobiu added sub-issue #8965
- 2026-02-03T18:31:26Z @tobiu added sub-issue #8966
- 2026-02-03T18:31:28Z @tobiu added sub-issue #8967
- 2026-02-03T18:31:30Z @tobiu added sub-issue #8968
- 2026-02-03T18:31:32Z @tobiu added sub-issue #8969
- 2026-02-03T20:51:57Z @tobiu added sub-issue #8970
- 2026-02-03T21:12:28Z @tobiu added sub-issue #8971
- 2026-02-03T21:17:44Z @tobiu added sub-issue #8973
- 2026-02-03T21:34:44Z @tobiu added sub-issue #8974
- 2026-02-04T00:01:32Z @tobiu added sub-issue #8975
- 2026-02-04T00:13:41Z @tobiu added sub-issue #8976
- 2026-02-04T00:37:34Z @tobiu added sub-issue #8977
- 2026-02-04T10:21:46Z @tobiu added sub-issue #8978
- 2026-02-04T10:23:17Z @tobiu added sub-issue #8979
- 2026-02-04T13:10:39Z @tobiu added sub-issue #8984
- 2026-02-04T13:33:28Z @tobiu added sub-issue #8985
- 2026-02-04T13:51:35Z @tobiu added sub-issue #8986
- 2026-02-04T14:00:16Z @tobiu referenced in commit `875ed77` - "docs: Knowledge Base Enhancement Strategy for Grid Classes (#8964) #8986"
- 2026-02-04T14:03:39Z @tobiu referenced in commit `126ae36` - "feat: Grid Row Architecture Refactor (Epic #8964)

# Conflicts:
#	resources/content/.sync-metadata.json
#	resources/content/issues/issue-8964.md"
### @tobiu - 2026-02-04T14:05:38Z

resolved.

- 2026-02-04T14:05:38Z @tobiu closed this issue

