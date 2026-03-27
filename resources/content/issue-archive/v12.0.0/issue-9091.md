---
id: 9091
title: 'Feat: Enhance Neo.data.Store to support Proxy loading'
state: CLOSED
labels:
  - ai
  - core
  - feature
assignees:
  - tobiu
createdAt: '2026-02-10T17:55:55Z'
updatedAt: '2026-02-10T19:35:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9091'
author: tobiu
commentsCount: 1
parentIssue: 9089
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T19:35:40Z'
---
# Feat: Enhance Neo.data.Store to support Proxy loading

## Objective
Update `Neo.data.Store` to utilize the new Proxy architecture for data loading.

## Tasks
1.  **Proxy Integration:**
    -   Add a `proxy` config to `Store`.
    -   If `proxy` is defined (and is a valid instance/config), use it in `load()`.

2.  **Incremental Loading:**
    -   Implement listeners/callbacks for the Proxy's streaming events.
    -   When the Proxy yields a chunk of records:
        -   Instantiate Models (if configured).
        -   Add them to the internal collection *without* firing a "refresh" event every time.
        -   Fire a new `recordsLoaded` (or similar) event for the chunk.
    -   Fire `load` event only when the stream is fully complete.

3.  **Backwards Compatibility:**
    -   Ensure existing `url` / `autoLoad` behavior works (either via legacy logic or by auto-creating a default `Ajax` proxy under the hood, though that might be out of scope for step 1). For now, `proxy` should probably be an alternative to the standard `load`.

## Key Challenge
Handling sorting/filtering during a stream. Ideally, we just append. If the store is sorted, we might need to insert-sort (expensive) or just wait until the end. *Decision:* For Phase 1, assume "append-only" behavior during load, then sort at the end (or assume the source is pre-sorted).

## Timeline

- 2026-02-10T17:55:56Z @tobiu added the `ai` label
- 2026-02-10T17:55:57Z @tobiu added the `core` label
- 2026-02-10T17:55:57Z @tobiu added the `feature` label
- 2026-02-10T17:56:12Z @tobiu added parent issue #9089
- 2026-02-10T18:05:35Z @tobiu cross-referenced by #9093
- 2026-02-10T18:08:47Z @tobiu assigned to @tobiu
- 2026-02-10T18:51:31Z @tobiu cross-referenced by #9092
### @tobiu - 2026-02-10T19:35:05Z

**Input from Gemini 3 Pro:**

> ✦ I have enhanced the JSDoc for the core classes involved in this feature.
> 
> ### Documentation Updates
> 1.  **`src/data/proxy/Base.mjs`**: Added architectural context about the Proxy pattern, its role in decoupling transport from state, and future roadmap items (Ajax, WebSocket).
> 2.  **`src/data/proxy/Stream.mjs`**: Added detailed explanation of the chunking/buffering strategy and the performance benefits of avoiding micro-events.
> 3.  **`src/data/Store.mjs`**: Added a new "Progressive Loading (Streaming)" section to the class documentation, explaining how `proxy` integration enables incremental UI updates.
> 
> This completes the code-level documentation enhancement. I will now proceed to create the comprehensive "Streaming Data" guide.
> 

- 2026-02-10T19:35:40Z @tobiu closed this issue

