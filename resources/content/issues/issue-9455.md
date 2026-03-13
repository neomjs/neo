---
id: 9455
title: Integrate RPC API into Pipeline Architecture (Connection.Rpc)
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T21:03:19Z'
updatedAt: '2026-03-12T21:04:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9455'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Integrate RPC API into Pipeline Architecture (Connection.Rpc)

### Goal
Integrate the existing RPC API seamlessly into the new Pipeline architecture.

### Context
Currently, the RPC API bypasses all parsing and normalization. If a Store uses an `api` config, it calls generated proxy functions (e.g., `ColorService.read()`) that return raw JSON directly from the Data Worker to the App Worker Store.

### Acceptance Criteria
- Create `Neo.data.connection.Rpc` extending `connection.Base`.
- Instead of a `url` config, it should accept an `api` config (e.g., `'Colors.backend.ColorService'`).
- Its `read()` method should act as an adapter: it invokes the underlying RPC proxy method to fetch the data.
- Once the RPC proxy resolves, `Connection.Rpc` must pipe that raw JSON response through the Pipeline's `Parser` and `Normalizer` before the `Pipeline` returns the final data back to the Store.
- Provide a backwards-compatibility layer or migration guide for `Store.api` to map to `Store.pipeline.connection.api`.

## Timeline

- 2026-03-12T21:03:20Z @tobiu added the `enhancement` label
- 2026-03-12T21:03:20Z @tobiu added the `ai` label
- 2026-03-12T21:03:20Z @tobiu added the `architecture` label
- 2026-03-12T21:03:20Z @tobiu added the `core` label
- 2026-03-12T21:03:42Z @tobiu cross-referenced by #9449
- 2026-03-12T21:04:08Z @tobiu added parent issue #9449
- 2026-03-12T21:04:26Z @tobiu assigned to @tobiu

