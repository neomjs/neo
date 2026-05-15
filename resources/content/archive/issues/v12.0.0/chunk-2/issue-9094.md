---
id: 9094
title: 'Feat: Batch Streaming & Progressive Rendering for Proxy Loader'
state: CLOSED
labels:
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-10T19:16:46Z'
updatedAt: '2026-02-10T19:24:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9094'
author: tobiu
commentsCount: 1
parentIssue: 9089
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T19:24:49Z'
---
# Feat: Batch Streaming & Progressive Rendering for Proxy Loader

# Feat: Batch Streaming & Progressive Rendering for Proxy Loader

## Objective
Optimize the `Neo.data.proxy.Stream` and `Neo.data.Store` integration to solve the performance regression caused by single-record event firing. Implement chunked streaming and progressive UI updates.

## Problem
The initial implementation fired a `data` event for every single record in the NDJSON stream. For 11k records, this caused massive overhead (11k events, 11k store updates, 11k microtasks), blocking the App Worker for ~10s.

## Solution
1.  **Batching (`chunkSize`):** Update `Stream.mjs` to buffer parsed records and fire the `data` event only when `chunkSize` (e.g., 500) is reached.
2.  **Progressive Rendering:** Update `Store.mjs` to remove `suspendEvents` during the stream. Instead, listen for the chunked `data` events, add the chunk to the store, and fire a `load` event immediately. This allows the Grid to render the first chunk (~500 rows) almost instantly while the rest of the stream continues in the background.

## Tasks
- [x] Add `chunkSize` config to `Neo.data.proxy.Stream`.
- [x] Implement buffering logic in `Stream.read()` to yield arrays of records.
- [x] Refactor `Neo.data.Store.load()` to support progressive loading (remove `suspendEvents`, fire intermediate `load` events).
- [x] Update Unit Tests (`Stream.spec.mjs`, `StoreProxy.spec.mjs`).

## Expected Outcome
-   **Time to First Byte (TTFB):** Unchanged.
-   **Time to First Render (TTFR):** Drastically reduced (O(chunkSize) instead of O(Total)).
-   **UX:** User sees the grid populate immediately. Scrollbar grows as data streams in.


## Timeline

- 2026-02-10T19:16:47Z @tobiu added the `ai` label
- 2026-02-10T19:16:47Z @tobiu added the `performance` label
- 2026-02-10T19:16:47Z @tobiu added the `core` label
- 2026-02-10T19:17:01Z @tobiu added parent issue #9089
- 2026-02-10T19:18:33Z @tobiu referenced in commit `b3039cd` - "feat: Implement Batch Streaming & Progressive Rendering (#9094)"
### @tobiu - 2026-02-10T19:18:46Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the batching and progressive rendering optimizations.
> 
> ### Changes
> 1.  **`src/data/proxy/Stream.mjs`**: Added `chunkSize: 500`. The `read` loop now buffers records and fires the `data` event with an *array* of 500 items at a time.
> 2.  **`src/data/Store.mjs`**:
>     -   Removed `suspendEvents` during the proxy load.
>     -   Updated the `onData` handler to accept an array and `add()` it directly.
>     -   Set `isLoading = false` immediately after the first chunk arrives to unmask the grid.
>     -   Fires `load` event after every chunk with the updated `total` count, allowing the Grid to update its scrollbar and row count progressively.
> 
> ### Verification
> -   Updated `test/playwright/unit/data/proxy/Stream.spec.mjs` to expect array payloads.
> -   Updated `test/playwright/unit/data/StoreProxy.spec.mjs` to verify progressive loading behavior.
> -   Tests passed.
> 
> This should resolve the 10s regression and provide immediate visual feedback.
> 

- 2026-02-10T19:22:28Z @tobiu assigned to @tobiu
- 2026-02-10T19:24:49Z @tobiu closed this issue

