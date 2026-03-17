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
updatedAt: '2026-03-17T17:09:51Z'
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
Unify the standalone RPC API with the Data Pipeline architecture. Allow `Neo.data.Store` to use RPC as a transport, and conversely, allow standalone RPC calls to utilize Parsers and Normalizers.

### Context
Currently, the RPC API bypasses all parsing and normalization. If a Store uses an `api` config, it calls generated proxy functions that return raw JSON directly from the Data Worker to the App Worker Store. This prevents us from using powerful Normalizers (like `Tree`) with RPC data. 

We need to create a "Merged Universe" where data shaping is transport-agnostic and available everywhere.

### Acceptance Criteria

**1. Store to RPC (Connection.Rpc)**
- Create `Neo.data.connection.Rpc` extending `connection.Base`.
- Instead of a `url` config, it accepts an `api` config (e.g., `'MyApp.backend.ColorService'`).
- Its `read()` method acts as an adapter: it invokes the underlying RPC proxy method within the Data Worker.
- The raw JSON response is returned to the Data Worker's `Pipeline`, which pipes it through the `Parser` and `Normalizer` before sending the final data back to the App Worker Store.

**2. RPC to Pipeline (The Merged Universe)**
- Enhance `Neo.remotes.Api` to inspect `remotes-api.json` configurations.
- If an RPC endpoint (method or stream) defines a `parser` or `normalizer` config, the `generateRemote` proxy function must be wrapped.
- When an App Worker `ViewController` calls this RPC proxy, the Data Worker must automatically pipe the backend's raw response through the specified Pipeline components before fulfilling the Promise (or triggering the callback) back in the App Worker.
- This ensures UI components only ever receive perfectly shaped, predictable data structures, regardless of backend formatting.

## Timeline

- 2026-03-12T21:03:20Z @tobiu added the `enhancement` label
- 2026-03-12T21:03:20Z @tobiu added the `ai` label
- 2026-03-12T21:03:20Z @tobiu added the `architecture` label
- 2026-03-12T21:03:20Z @tobiu added the `core` label
- 2026-03-12T21:03:42Z @tobiu cross-referenced by #9449
- 2026-03-12T21:04:08Z @tobiu added parent issue #9449
- 2026-03-12T21:04:26Z @tobiu assigned to @tobiu

