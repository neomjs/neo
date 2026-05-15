---
id: 9115
title: Optimize Store Streaming and Progressive Loading
state: CLOSED
labels:
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-12T18:18:39Z'
updatedAt: '2026-02-12T18:21:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9115'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T18:21:30Z'
---
# Optimize Store Streaming and Progressive Loading

Refactor `Neo.data.Store` and `Neo.data.proxy.Stream` to optimize progressive loading and prevent UI blocking.

**Key Changes:**
1.  **Eliminate Duplicate Load Events:** Remove manual `load` event firing in `Store.onData`. Rely on `onCollectionMutate` to trigger `load` events naturally when data is added, preventing double-firing for every chunk.
2.  **Unblock UI during Streaming:** Introduce `await me.timeout(5)` in the `Stream` proxy's read loop. This yields control to the App Worker's event loop, allowing it to process VDOM updates and other events while parsing a large stream.
3.  **Track Streaming State:** Introduce `isStreaming` flag on the Store (managed via the Proxy) to distinguish between intermediate progressive updates and the final load completion.
4.  **Base Proxy Enhancement:** Add `store` config to `Neo.data.proxy.Base` to give proxies direct access to their owner store.

**Goal:** Ensure smooth, progressive rendering for large datasets (e.g., DevIndex) without freezing the UI.

## Timeline

- 2026-02-12T18:18:41Z @tobiu added the `performance` label
- 2026-02-12T18:18:41Z @tobiu added the `core` label
- 2026-02-12T18:19:37Z @tobiu assigned to @tobiu
- 2026-02-12T18:21:03Z @tobiu referenced in commit `4b1e3c3` - "feat: Optimize Store Streaming and Progressive Loading (#9115)"
### @tobiu - 2026-02-12T18:21:05Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the optimizations for store streaming and progressive loading.
> 
> **Changes:**
> 1.  **Eliminated Duplicate Load Events:** Removed the manual `fire('load')` call in `Neo.data.Store.onData`. The store now relies on the `mutate` event (triggered by `add()`) to fire `load` events via `onCollectionMutate`, preventing double-firing for every data chunk.
> 2.  **Unblocked UI during Streaming:** Added `await me.timeout(5)` to the `Neo.data.proxy.Stream` read loop. This yields control to the App Worker's event loop, allowing VDOM updates and other events to be processed during large stream parsing.
> 3.  **Tracked Streaming State:** Introduced `isStreaming` logic in `Neo.data.Store.load` and updated `onCollectionMutate` to include an `isLoading` flag in the load event based on this state.
> 4.  **Base Proxy Enhancement:** Added the `store` config to `Neo.data.proxy.Base` to ensure proxies have direct access to their owner store.
> 
> These changes ensure that the DevIndex grid renders smoothly and progressively as data streams in, without freezing the UI.

- 2026-02-12T18:21:30Z @tobiu closed this issue

