---
id: 8203
title: Optimizing `SummaryService.listSummaries` with Two-Phase Fetch
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - performance
assignees:
  - tobiu
createdAt: '2025-12-29T22:13:27Z'
updatedAt: '2025-12-29T22:24:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8203'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T22:24:19Z'
---
# Optimizing `SummaryService.listSummaries` with Two-Phase Fetch

ChromaDB lacks a native `ORDER BY` clause for metadata. The current implementation fetches all documents (limit 50), which prevents accessing older sessions and is unscalable.

**Proposed Solution: Two-Phase Fetch Pattern**
To achieve efficient, SQL-like pagination without native DB support:

1.  **Phase 1 (Lightweight):** Fetch `ids` and `metadatas` for ALL sessions.
    *   *Note:* This scales well because we avoid fetching the heavy `document` (text) field.
2.  **In-Memory Sort:** Sort the metadata array by `timestamp` (DESC).
3.  **Pagination:** Apply `offset` and `limit` to the sorted array to identify the target IDs.
4.  **Phase 2 (Targeted):** Fetch the full `documents` for ONLY the sliced IDs.

**Benefits:**
- **Accuracy:** Guaranteed to return the true "latest" sessions.
- **Performance:** Significantly reduces network payload and memory usage by only transferring necessary text data.
- **Scalability:** Supports paging through the entire history, not just the random first 50.

## Timeline

- 2025-12-29T22:13:29Z @tobiu added the `enhancement` label
- 2025-12-29T22:13:29Z @tobiu added the `ai` label
- 2025-12-29T22:13:29Z @tobiu added the `refactoring` label
- 2025-12-29T22:13:30Z @tobiu added the `performance` label
- 2025-12-29T22:13:36Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-29T22:14:21Z

cross reference link: https://github.com/chroma-core/chroma/issues/469
=> it is sad to see that the ordering feature never got implemented.

- 2025-12-29T22:24:04Z @tobiu referenced in commit `f562965` - "Refactor(Memory): Implement two-phase fetch for global sorting in listSummaries (#8203)"
### @tobiu - 2025-12-29T22:24:18Z

Implemented the two-phase fetch strategy to ensure correct global sorting and pagination of session summaries. Phase 1 fetches lightweight metadata for sorting, and Phase 2 fetches the full documents for the target slice, using a Map for O(1) re-assembly to preserve order.

- 2025-12-29T22:24:19Z @tobiu closed this issue

