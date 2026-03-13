---
id: 9454
title: Implement Push-Based WebSocket Integration in Data Pipeline
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T20:16:18Z'
updatedAt: '2026-03-12T21:04:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9454'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Push-Based WebSocket Integration in Data Pipeline

As part of the Data Pipeline modernization (Epic #9449), we need to ensure that the pipeline natively supports push-based updates via WebSockets.

Currently, the pipeline is designed around a pull-based model (`Store.load()` -> `Connection.read()`). However, with WebSockets, the backend can spontaneously push new data to connected clients.

**Requirements:**
1. **Observable Connections:** `Neo.data.connection.WebSocket` (and potentially `Connection.Base`) must support listening for unsolicited incoming messages from the server.
2. **Unified Shaping:** When a push message is received, the `Connection` must automatically route the raw payload through its assigned `Parser` and `Normalizer`.
3. **Store Integration:** The `Store` must be able to subscribe to these pushed updates from its `Connection` and gracefully ingest the new/updated records into its existing collection without requiring a full `load()` cycle.
4. **Thread Agnosticism:** If the `Connection` is executing remotely in the Data Worker, the pushed data must be parsed/normalized in the Data Worker and only the finalized records should be `postMessage`'d back to the App Worker Store.

## Timeline

- 2026-03-12T20:16:19Z @tobiu added the `enhancement` label
- 2026-03-12T20:16:19Z @tobiu added the `ai` label
- 2026-03-12T20:16:19Z @tobiu added the `architecture` label
- 2026-03-12T20:16:19Z @tobiu added the `core` label
- 2026-03-12T20:18:45Z @tobiu added parent issue #9449
- 2026-03-12T21:00:08Z @tobiu cross-referenced by #9449
- 2026-03-12T21:04:21Z @tobiu assigned to @tobiu

