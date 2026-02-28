---
id: 9089
title: 'Epic: Engine-Level Streaming Data Loader (JSONL)'
state: CLOSED
labels:
  - epic
  - ai
  - performance
  - core
  - feature
assignees:
  - tobiu
createdAt: '2026-02-10T17:26:24Z'
updatedAt: '2026-02-10T19:51:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9089'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues:
  - '[x] 9090 Feat: Implement Neo.data.proxy.Base and Neo.data.proxy.Stream'
  - '[x] 9091 Feat: Enhance Neo.data.Store to support Proxy loading'
  - '[x] 9092 Refactor: Convert DevRank to use Streaming Proxy'
  - '[x] 9093 Refactor: DevRank Backend JSONL Persistence'
  - '[x] 9094 Feat: Batch Streaming & Progressive Rendering for Proxy Loader'
  - '[x] 9095 Docs: "Streaming Data & Progressive Rendering" Guide'
subIssuesCompleted: 6
subIssuesTotal: 6
blockedBy: []
blocking: []
closedAt: '2026-02-10T19:51:34Z'
---
# Epic: Engine-Level Streaming Data Loader (JSONL)

## Objective
Enable `Neo.data.Store` to stream and parse data incrementally (NDJSON/JSONL), allowing for O(1) memory usage and immediate rendering of large datasets (10k+ records) without blocking the UI or waiting for the full download.

## Why?
- **Performance:** Reduces "Time to First Record" from O(N) to O(1).
- **Memory:** Prevents parsing massive JSON strings in memory.
- **UX:** Enables progressive rendering for applications like DevRank (10k users) or Big Data Grids.

## Scope
1.  **Framework Core:**
    -   Implement a streaming reader (likely in `src/data/reader` or directly in `Store`) that uses `fetch`, `ReadableStream`, and `TextDecoderStream`.
    -   Support `format: 'jsonl'` in Store configuration.
    -   Ensure compatibility with `autoLoad: true`.

2.  **DevRank Integration:**
    -   Convert `users.json` to `users.jsonl`.
    -   Update DevRank's Store to use the new streaming capability.

3.  **Documentation:**
    -   Create a "Streaming Data" guide.

## Technical Approach
Leverage modern browser APIs (`TransformStream`) which are available in Workers. Use the prototype from the DevRank experiment as a baseline.

## Timeline

- 2026-02-10T17:26:25Z @tobiu added the `epic` label
- 2026-02-10T17:26:25Z @tobiu added the `ai` label
- 2026-02-10T17:26:26Z @tobiu added the `performance` label
- 2026-02-10T17:26:26Z @tobiu added the `core` label
- 2026-02-10T17:26:26Z @tobiu added the `feature` label
### @tobiu - 2026-02-10T17:54:48Z

**Input from Gemini 3 Pro:**

> ✦ ## Architectural Decision: The Proxy Pattern
> 
> To modernize the data layer for v12, we will reintroduce the **Store / Proxy** separation pattern:
> 
> 1.  **`Neo.data.proxy.Base`**: Abstract interface for data fetching strategies.
> 2.  **`Neo.data.proxy.Stream`**: Concrete implementation for the App Worker that uses `fetch` + `ReadableStream` + `TextDecoderStream` to parse NDJSON/JSONL.
> 3.  **`Neo.data.Store`**: Updated to accept a `proxy` configuration. If present, the Store delegates data loading to the proxy.
> 
> **Why?**
> This decoupling allows us to switch transport layers (Ajax, Stream, WebSocket, LocalStorage) without changing the Store's logic. It also paves the way for a potential future "Remote Proxy" that could live in the Data Worker, although Phase 1 will keep the Stream Proxy in the App Worker to avoid serialization overhead.

- 2026-02-10T17:55:23Z @tobiu assigned to @tobiu
- 2026-02-10T17:55:41Z @tobiu added sub-issue #9090
- 2026-02-10T17:56:12Z @tobiu added sub-issue #9091
- 2026-02-10T17:58:22Z @tobiu added sub-issue #9092
- 2026-02-10T18:05:35Z @tobiu cross-referenced by #9093
- 2026-02-10T18:05:45Z @tobiu added sub-issue #9093
### @tobiu - 2026-02-10T18:06:52Z

**Input from Gemini 3 Pro:**

> ✦ ## Context for Implementation
> 
> We have extensively researched and prototyped the technical foundation for this Epic.
> 
> **Key Findings:**
> 1.  **Browser Support:** The Streams API (`ReadableStream`, `TextDecoderStream`, `TransformStream`) is fully supported in modern browsers and **Web Workers (including SharedWorkers)**.
> 2.  **Performance:** Initial benchmarks show a **~6x speedup** in "Time to First Record" (44ms vs 7ms on local disk) by streaming 10k records vs parsing the full JSON.
> 3.  **Architecture:**
>     -   **Phase 1 (Target):** Implement the `Stream` Proxy in the **App Worker**.
>     -   **Why?** Transferring a `ReadableStream` (bytes) to the App Worker is cheap. Parsing it there spreads the CPU load via the microtask queue (thanks to the stream). Transferring parsed Objects from a Data Worker would incur high serialization costs (Structured Clone) for 10k+ records, potentially negating the benefits.
>     -   **Phase 2 (Future):** If CPU load becomes a bottleneck for 100k+ records, we can introduce a `Remote` Proxy that parses in the Data Worker and batches records via `postMessage`.
> 
> **Implementation Notes:**
> -   We need `src/data/proxy/Base.mjs` as a common interface.
> -   We need `src/data/proxy/Stream.mjs` as the NDJSON implementation.
> -   `Neo.data.Store` needs to handle incremental data arrival (append-only initially, sort-at-end strategy).
> -   The backend (Spider/Updater) must switch to appending JSONL to support the new format efficiently.

- 2026-02-10T18:09:38Z @tobiu changed title from **Epic: Framework-Level Streaming Data Loader (JSONL)** to **Epic: Engine-Level Streaming Data Loader (JSONL)**
- 2026-02-10T19:17:01Z @tobiu added sub-issue #9094
- 2026-02-10T19:32:04Z @tobiu cross-referenced by #9095
- 2026-02-10T19:32:19Z @tobiu added sub-issue #9095
### @tobiu - 2026-02-10T19:51:09Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully completed the Streaming Data Loader epic.
> 
> ### Summary of Work
> 1.  **Architecture:** Implemented `Neo.data.proxy.Stream` using `fetch` and `TextDecoderStream` for efficient, non-blocking data ingestion in the App Worker.
> 2.  **Core Support:** Updated `Neo.data.Store` to support the `proxy` config and "Progressive Loading," allowing the grid to render chunks of data as they arrive.
> 3.  **Optimization:** Implemented batching (chunkSize: 500) to solve the initial performance regression, reducing overhead and improving TTFR by ~10x compared to standard JSON parsing.
> 4.  **DevRank Integration:** Migrated the DevRank backend to `.jsonl` persistence and updated the frontend Store to use the new streaming architecture.
> 5.  **Documentation:** Created a comprehensive guide `learn/guides/datahandling/Streaming.md` and enhanced class-level JSDocs.
> 
> The infrastructure is now in place for high-performance data handling in Neo.mjs v12.
> 

- 2026-02-10T19:51:35Z @tobiu closed this issue

