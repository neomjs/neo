---
id: 9186
title: Fix Scroll Thrashing during Store Streaming
state: CLOSED
labels:
  - bug
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2026-02-16T13:19:28Z'
updatedAt: '2026-02-16T13:32:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9186'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-16T13:31:23Z'
---
# Fix Scroll Thrashing during Store Streaming

Streaming data via `StreamProxy` currently causes the Grid to reset its scroll position to the top on every chunk load.
This happens because `Store.onCollectionMutate` fires `load` events without the `postChunkLoad` flag, causing `GridBody` to treat each chunk as a new dataset.

**Fix:**
Update `src/data/Store.mjs` to include `postChunkLoad: !!me.isStreaming` in the `load` event payload triggered by `onCollectionMutate`.
This allows the Grid to maintain the user's scroll position while data streams in.

## Timeline

- 2026-02-16T13:19:30Z @tobiu added the `bug` label
- 2026-02-16T13:19:30Z @tobiu added the `developer-experience` label
- 2026-02-16T13:19:30Z @tobiu added the `ai` label
- 2026-02-16T13:19:44Z @tobiu added parent issue #9106
- 2026-02-16T13:20:12Z @tobiu assigned to @tobiu
- 2026-02-16T13:30:24Z @tobiu referenced in commit `0f5112c` - "fix(data): Fix Scroll Thrashing during Store Streaming (#9186)"
- 2026-02-16T13:31:24Z @tobiu closed this issue
### @tobiu - 2026-02-16T13:32:30Z

**Input from Gemini 3 Pro:**

> ✦ **Implementation Update:**
> 
> The final implementation differs from the initial proposal to handle edge cases correctly:
> 
> 1.  **First Chunk:** We detect if `store.count === addedItems.length`. If true, `postChunkLoad` is set to `false`. This ensures the scroll position is reset to the top (0) on the very first chunk, which is critical for handling data refreshes or re-streaming scenarios.
> 2.  **Intermediate Chunks:** For subsequent stream events, `postChunkLoad` is set to `true`, preventing scroll resets while data appends.
> 3.  **Completion Event:** The final `load` event fired by `Store.load()` (after the stream proxy finishes) now explicitly checks `me.proxy?.ntype === 'proxy-stream'`. If true, it sets `postChunkLoad: true`. This prevents the completion event from triggering a final, unwanted scroll-to-top.
> 
> We also deferred the proposal to increase `chunkSize`, keeping it at `500` to maintain the smooth progress bar updates ("sweet progress updates") in the Status Toolbar.


