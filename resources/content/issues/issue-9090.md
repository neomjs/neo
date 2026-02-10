---
id: 9090
title: 'Feat: Implement Neo.data.proxy.Base and Neo.data.proxy.Stream'
state: OPEN
labels:
  - ai
  - core
  - feature
assignees:
  - tobiu
createdAt: '2026-02-10T17:55:28Z'
updatedAt: '2026-02-10T18:08:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9090'
author: tobiu
commentsCount: 0
parentIssue: 9089
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

