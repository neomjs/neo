---
id: 9187
title: Investigate and Optimize Stream Proxy Performance
state: OPEN
labels:
  - enhancement
  - ai
  - performance
assignees: []
createdAt: '2026-02-16T15:13:24Z'
updatedAt: '2026-02-16T15:13:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9187'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

