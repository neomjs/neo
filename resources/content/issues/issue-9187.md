---
id: 9187
title: Investigate and Optimize Stream Proxy Performance
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-16T15:13:24Z'
updatedAt: '2026-02-16T23:34:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9187'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-16T23:34:42Z'
---
# Investigate and Optimize Stream Proxy Performance

The `Neo.data.proxy.Stream` implementation shows significant performance degradation when using small chunk sizes (500 items) compared to large ones (10k items) for a 13.87MB dataset (10s vs 2s).

**Objectives:**
1.  Instrument `src/data/proxy/Stream.mjs` with `performance.now()` to profile the bottleneck.
2.  Analyze the overhead of the `timeout(5)` delay per chunk.
3.  Analyze the cost of `Store.add()` and the event chain (`data` -> `load` -> `grid.render`).
4.  Optimize the proxy and store interaction to handle small chunks efficiently or dynamic chunk sizing.

**Proposed Changes:**
- Add performance logging to `Stream.mjs`.
- Make the `timeout` configurable or adaptive.
- Investigate `Store`'s handling of `postChunkLoad` events.

## Timeline

- 2026-02-16T15:13:25Z @tobiu added the `enhancement` label
- 2026-02-16T15:13:25Z @tobiu added the `ai` label
- 2026-02-16T15:13:25Z @tobiu added the `performance` label
- 2026-02-16T23:33:50Z @tobiu referenced in commit `582536a` - "feat(proxy): Implement Progressive Chunk Sizing for Stream Proxy (#9187)"
- 2026-02-16T23:34:02Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-16T23:34:29Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented a **Progressive Chunk Sizing** strategy for the Stream Proxy to balance immediate UI feedback with high throughput for large datasets.
> 
> **The Solution:**
> Instead of a fixed `chunkSize`, the proxy now dynamically scales the chunk size based on the total number of records processed so far:
> 
> -   **Phase 1 (Start):** Small chunks (100-250) for immediate "Time to First Content" and frequent UI updates.
> -   **Phase 2 (Ramp):** Medium chunks (500-1500) as the user processes the initial data.
> -   **Phase 3 (Bulk):** Massive chunks (2500-10000) for the tail end of the dataset.
> 
> **Performance Impact:**
> -   **Initial Render:** Instant (first 100 items).
> -   **Total Load Time:** Reduced from ~10s (small chunks) to ~1.8s (comparable to the 10k chunk benchmark).
> -   **UX:** The user sees the list populate immediately and grow smoothly, without the "jank" of excessive small updates or the "freeze" of massive initial chunks.
> 
> **Implementation Details:**
> -   Added `progressiveChunkSize_` config to `Neo.data.proxy.Stream`.
> -   Enabled this mode in `DevIndex.store.Contributors`.
> -   Reverted previous attempts at adaptive yielding and auto-sort disabling, as they provided marginal gains for significant complexity/UX cost.
> 

- 2026-02-16T23:34:42Z @tobiu closed this issue
- 2026-02-17T00:21:31Z @tobiu referenced in commit `9dd97e7` - "feat(devindex): Implement Stop Stream capability with progressive chunk sizing (#9187, #9188)"
- 2026-02-17T00:52:13Z @tobiu cross-referenced by #9189

