---
id: 7180
title: Enhance Store Chunking for Instant Grid Previews
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-11T12:04:41Z'
updatedAt: '2025-08-11T12:06:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7180'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-11T12:06:05Z'
---
# Enhance Store Chunking for Instant Grid Previews

**Is your feature request related to a problem? Please describe.**

When adding a very large number of records (e.g., 1M+) to a `data.Store`, the operation can block the application worker for several seconds. While this does not freeze the UI (main thread), it makes the application feel unresponsive as no visual updates or feedback are provided to the user until the entire operation is complete.

**Describe the solution you'd like**

A coordinated enhancement across `data.Store`, `grid.Body`, and `grid.Container` has been implemented to achieve an "instant preview" effect when adding large datasets.

1.  **Two-Phase Load in `data.Store`:**
    *   When a large number of items are added, the store immediately adds an initial chunk (e.g., 1000 records) to its collection.
    *   It then fires a **first `load` event** containing `{items: chunk, total: final_total}`. The `total` property holds the final count of all records that will eventually be loaded.
    *   The store then silently adds the rest of the records and fires a **second, final `load` event** once the entire operation is complete.

2.  **Coordinated Grid Updates:**
    *   **`grid.Container`**: The container listens for the *first* `load` event. It immediately uses the `total` from the event payload to update its `aria-rowcount`. This ensures that accessibility tools and the vertical scrollbar correctly reflect the final size of the dataset, even before all data has been processed by the store.
    *   **`grid.Body`**: The grid body *also* acts on the *first* `load` event. It calls `createViewData()`, which renders the initial chunk of data. This provides the user with an "instant preview" of the data, making the application feel highly responsive.
    *   When the *final* `load` event arrives, the grid body re-renders its view, and since the store is now fully populated, scrolling through the entire dataset works as expected.

**Benefits of this approach:**

*   **Instant Preview:** The UI is not blocked. The user immediately sees the first chunk of data, confirming the operation is in progress.
*   **Correct Layout & Accessibility:** The grid's scrollbar and `aria-rowcount` are sized correctly from the very beginning, preventing layout shifts and providing an accurate representation of the full dataset.
*   **Improved User Experience:** Eliminates long freezes when loading large amounts of data, providing a much smoother and more informative experience.

## Timeline

- 2025-08-11T12:04:41Z @tobiu assigned to @tobiu
- 2025-08-11T12:04:43Z @tobiu added the `enhancement` label
- 2025-08-11T12:05:09Z @tobiu referenced in commit `f2bde56` - "Enhance Store Chunking for Instant Grid Previews #7180"
- 2025-08-11T12:06:05Z @tobiu closed this issue

