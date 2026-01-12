---
id: 6984
title: Refactor - Store Composition with Collection
state: OPEN
labels:
  - help wanted
  - good first issue
  - epic
  - hacktoberfest
assignees: []
createdAt: '2025-07-07T23:52:22Z'
updatedAt: '2025-10-30T18:56:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6984'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor - Store Composition with Collection

## Refactor `Neo.data.Store` to use `Neo.collection.Base` via composition instead of inheritance.

**Description**
Currently, `Neo.data.Store` extends `Neo.collection.Base`, inheriting all its methods and properties. While this approach has been functional, it creates a tight coupling between the two classes and can lead to `Store` carrying unnecessary baggage from `Collection.Base`'s responsibilities. This refactoring proposes a shift from inheritance to composition, where `Neo.data.Store` will internally *use* an instance of `Neo.collection.Base`.

**Problem**
1.  **Tight Coupling:** `Store` is tightly coupled to `Collection.Base` through inheritance, meaning changes in `Collection.Base` directly impact `Store` and vice-versa, even if the changes are not directly relevant to `Store`'s core responsibilities.
2.  **Lack of Specialization:** `Store` inherits all collection methods, regardless of whether it needs them or if it has its own specialized versions (e.g., `add` in `Store` needs to handle record creation, which is different from `Collection.Base`'s generic `add`).
3.  **Reduced Flexibility:** It's less flexible to combine different data handling strategies (e.g., local vs. remote filtering/sorting) or to swap out the underlying collection implementation if `Store` is directly inheriting from it.

**Proposed Solution**
Refactor `Neo.data.Store` to use `Neo.collection.Base` via composition. This means:

1.  **Remove Inheritance:** `Neo.data.Store` will no longer `extend Neo.collection.Base`.
2.  **Internal Collection Instance:** `Neo.data.Store` will contain a private instance of `Neo.collection.Base` (e.g., `#collection`) as a core component.
3.  **Delegation:** All collection-related operations (e.g., `add`, `remove`, `get`, `filter`, `sort`, `splice`, `getCount`, `indexOf`) will be delegated to this internal `#collection` instance. `Store` will re-implement these methods, calling the corresponding method on its internal collection.
4.  **Focus on Store Responsibilities:** `Store` will primarily focus on its unique responsibilities, such as:
    *   Data loading (via `api` or `url`)
    *   Integration with `Neo.data.Model` (field management) and `Neo.data.RecordFactory` (record creation)
    *   Pagination
    *   Remote filtering and sorting
    *   Data readers and writers

**Benefits**
*   **Clearer Separation of Concerns:** `Collection.Base` can remain a pure data management utility, while `Store` focuses on data acquisition and higher-level data manipulation.
*   **Increased Modularity and Flexibility:** `Store` becomes more modular, allowing for easier integration of different data handling strategies or swapping out the underlying collection implementation.
*   **Easier Combinability:** Promotes simpler combination of local and remote data processing capabilities.
*   **Alignment with Proven Patterns:** Aligns with robust architectural patterns (e.g., similar to Ext.JS's Store/Collection relationship), leading to a more maintainable and scalable codebase.
*   **Improved Testability:** Each component can be tested more independently.

**Effort & Considerations**
This is a **medium-sized refactoring effort**. It will require:
*   Careful re-implementation of all delegated methods in `Neo.data.Store`.
*   Thorough review of internal property accesses within `Store` to ensure they use the internal collection's public API.
*   Extensive unit and integration testing to prevent regressions and ensure seamless functionality across all existing features.

## Timeline

- 2025-07-07T23:52:23Z @tobiu added the `enhancement` label
- 2025-07-07T23:52:23Z @tobiu added the `help wanted` label
### @github-actions - 2025-10-06T02:42:09Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-10-06T02:42:10Z @github-actions added the `stale` label
- 2025-10-08T09:43:23Z @tobiu removed the `stale` label
- 2025-10-08T09:43:23Z @tobiu added the `good first issue` label
- 2025-10-08T09:43:23Z @tobiu added the `hacktoberfest` label
### @tobiu - 2025-10-08T09:44:23Z

this one could get refined to via the ai native workflows into new subs, and based on it fits the `hacktoberfest` scope.

- 2025-10-08T09:44:42Z @tobiu removed the `enhancement` label
- 2025-10-08T09:44:42Z @tobiu added the `epic` label
### @shrvansudhakara - 2025-10-30T18:56:19Z

@tobiu I'd like to work on this, pls assign.


