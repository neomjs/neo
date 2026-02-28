---
id: 9189
title: Enhance Stream Proxy with DecompressionStream Support
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-17T00:40:46Z'
updatedAt: '2026-02-17T00:52:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9189'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-17T00:52:30Z'
---
# Enhance Stream Proxy with DecompressionStream Support

This task enhances the `Neo.data.proxy.Stream` to support client-side decompression of data streams using the browser's `DecompressionStream` API. This is a strategic enabler for scaling datasets (e.g., from 50k to 100k+ records) by significantly reducing network transfer size (estimated 70-80% reduction for JSONL).

**Objectives:**
1.  **Proxy Enhancement (`src/data/proxy/Stream.mjs`):**
    -   Add a `compression` config (`'gzip'`, `'deflate'`, or `null`).
    -   If set, pipe the fetch response body through `new DecompressionStream(this.compression)` before reading.
    -   Ensure compatibility with existing features (Progressive Chunking, Abort).

2.  **Proof of Concept (Experiment):**
    -   Manually compress `users.jsonl` to `users.jsonl.gz`.
    -   Configure `DevIndex.store.Contributors` to load the compressed file with `compression: 'gzip'`.
    -   Verify that the app loads correctly and measure the network transfer savings.

3.  **Cleanup:**
    -   Revert the store configuration to use the uncompressed file (to maintain meaningful git diffs for data updates).
    -   Keep the Proxy capability merged.

**Acceptance Criteria:**
-   [ ] `Stream.read()` successfully decompresses a `.gz` file when configured.
-   [ ] Loading a compressed file triggers the same progressive events as an uncompressed one.
-   [ ] Network transfer size is significantly reduced (Validation).
-   [ ] Fallback/Error handling if `DecompressionStream` is missing (optional but good).

## Timeline

- 2026-02-17T00:40:48Z @tobiu added the `enhancement` label
- 2026-02-17T00:40:48Z @tobiu added the `ai` label
- 2026-02-17T00:40:48Z @tobiu added the `performance` label
- 2026-02-17T00:41:15Z @tobiu assigned to @tobiu
- 2026-02-17T00:51:52Z @tobiu referenced in commit `beee3f7` - "feat(proxy): Add DecompressionStream support for client-side gzip/deflate handling (#9189)"
### @tobiu - 2026-02-17T00:52:12Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented `DecompressionStream` support in `Neo.data.proxy.Stream`.
> 
> **Features:**
> -   **Config:** `compression: 'gzip' | 'deflate' | null`.
> -   **Implementation:** Transparently pipes the fetch stream through the browser's native `DecompressionStream`.
> -   **Impact:** Enables serving `.jsonl.gz` files directly.
>     -   **Proof of Concept:** Validated a ~60% size reduction (14MB -> 5.8MB) for the DevIndex dataset with full functionality.
> 
> This enhancement, combined with Progressive Chunk Sizing (#9187) and Abort support (#9188), positions the data layer to handle 100k+ record datasets efficiently.

- 2026-02-17T00:52:30Z @tobiu closed this issue

