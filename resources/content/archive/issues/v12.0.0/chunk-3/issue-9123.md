---
id: 9123
title: Enhance Stream Proxy with Adaptive Chunking for Faster TTFC
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-12T21:40:17Z'
updatedAt: '2026-02-12T22:07:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9123'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T22:07:21Z'
---
# Enhance Stream Proxy with Adaptive Chunking for Faster TTFC

We are missing a point here: the vdom engine gets close to no work after the first 100 items. It needs to update the aria total row count, and the scrollbar height. Pretty much it.

To optimize the Time To First Content (TTFC), we should implement an "Adaptive Chunking" strategy in the Stream Proxy.

**Proposal:**
Add `initialChunkSize` and `initialBurstCount` configs to `Neo.data.proxy.Stream`.
- `initialChunkSize`: Allows a smaller chunk size (e.g., 100) for the first few batches to render the visible viewport immediately.
- `initialBurstCount`: Defines how many of these small chunks to send before switching to the larger `chunkSize` (e.g., 500) for efficient background loading.

**Implementation Plan:**
1.  **`src/data/proxy/Stream.mjs`**: Implement the adaptive logic in the `read` method.
2.  **`apps/devindex/store/Contributors.mjs`**: Update the store configuration to use `initialChunkSize: 100` and `initialBurstCount: 5`.

This ensures the first paint happens ~5x faster (100 items vs 500), while maintaining high throughput for the remaining 50k+ records.


## Timeline

- 2026-02-12T21:40:18Z @tobiu added the `enhancement` label
- 2026-02-12T21:40:18Z @tobiu added the `ai` label
- 2026-02-12T21:40:18Z @tobiu added the `performance` label
- 2026-02-12T21:40:19Z @tobiu added the `core` label
- 2026-02-12T21:56:25Z @tobiu referenced in commit `73003b1` - "feat: Enhance Stream Proxy with Adaptive Chunking (100x5) (#9123)"
- 2026-02-12T22:06:00Z @tobiu assigned to @tobiu
- 2026-02-12T22:07:22Z @tobiu closed this issue

