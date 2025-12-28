---
id: 8173
title: Implement Unique App Worker Identification & Worker Topology
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T14:24:49Z'
updatedAt: '2025-12-28T14:27:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8173'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Unique App Worker Identification & Worker Topology

To correctly map the topology of a distributed Neo.mjs environment (multiple browsers, shared workers), App Workers need globally unique identifiers when connecting to the Neural Link.

**Requirements:**
1.  **Unique ID:** Generate a UUID for the App Worker instance (`appWorkerId`) on startup.
2.  **Handshake:** Update `Neo.ai.Client` to send a `register` payload upon WebSocket connection, including:
    *   `appWorkerId`
    *   `isSharedWorker` boolean
    *   `userAgent`
    *   `environment`
3.  **ConnectionService:** Update registry to track sessions by `appWorkerId` (or map socket ID to this metadata).
4.  **Tool:** Implement `get_worker_topology` to list connected workers.


## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added the `architecture` label
- 2025-12-28 @tobiu added parent issue #8169
- 2025-12-28 @tobiu assigned to @tobiu

