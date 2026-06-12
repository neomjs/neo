---
id: 9090
title: 'Feat: Implement Neo.data.proxy.Base and Neo.data.proxy.Stream'
state: CLOSED
labels:
  - ai
  - core
  - feature
assignees:
  - tobiu
createdAt: '2026-02-10T17:55:28Z'
updatedAt: '2026-02-10T18:34:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9090'
author: tobiu
commentsCount: 1
parentIssue: 9089
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T18:34:37Z'
---
# Feat: Implement Neo.data.proxy.Base and Neo.data.proxy.Stream

## Objective
Implement the foundational Proxy classes for the new data loading architecture.

## Tasks
1.  **`src/data/proxy/Base.mjs`**:
    -   Abstract base class.
    -   Should define the interface for `read(operation)` (or similar).
    -   Should handle basic URL configuration.

2.  **`src/data/proxy/Stream.mjs`**:
    -   Extends `Base`.
    -   Uses `fetch` to retrieve the resource.
    -   Implements the `NDJSONStream` parsing logic (using `TransformStream` and `TextDecoderStream`).
    -   Should expose a way to yield records incrementally (e.g., via events or a generator).

## Requirements
-   Must work in the App Worker (and potentially SharedWorker).
-   Must handle JSONL (newline-delimited JSON).
-   Error handling for network failures and parse errors.

## Timeline

- 2026-02-10T17:55:29Z @tobiu added the `ai` label
- 2026-02-10T17:55:30Z @tobiu added the `core` label
- 2026-02-10T17:55:30Z @tobiu added the `feature` label
- 2026-02-10T17:55:41Z @tobiu added parent issue #9089
- 2026-02-10T18:05:35Z @tobiu cross-referenced by #9093
- 2026-02-10T18:08:40Z @tobiu assigned to @tobiu
- 2026-02-10T18:32:34Z @tobiu referenced in commit `49edc7d` - "feat: Implement Neo.data.proxy.Stream and Store integration (#9090)"
### @tobiu - 2026-02-10T18:33:27Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented the streaming data loader infrastructure.
> 
> ### Changes
> 1.  **`src/data/proxy/Base.mjs`**: Created abstract base class for proxies.
> 2.  **`src/data/proxy/Stream.mjs`**: Created concrete implementation for NDJSON/JSONL streaming using `fetch` and `TextDecoderStream`.
> 3.  **`src/data/Store.mjs`**: Updated to support `proxy` config and streaming `load()` logic. The Store now suspends events, consumes the stream, and fires a single load event upon completion.
> 
> ### Verification
> Created robust unit tests:
> -   `test/playwright/unit/data/proxy/Stream.spec.mjs`
> -   `test/playwright/unit/data/StoreProxy.spec.mjs`
> 
> All tests passed.
> 

- 2026-02-10T18:34:38Z @tobiu closed this issue

