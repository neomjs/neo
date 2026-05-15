---
id: 8173
title: Implement Unique App Worker Identification & Worker Topology
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T14:24:49Z'
updatedAt: '2025-12-28T15:30:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8173'
author: tobiu
commentsCount: 2
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T15:30:11Z'
---
# Implement Unique App Worker Identification & Worker Topology

To correctly map the topology of a distributed Neo.mjs environment (multiple browsers, shared workers), App Workers need globally unique identifiers when connecting to the Neural Link.

**Requirements:**
1.  **Unique ID:** Generate a UUID for the App Worker instance (`id`) on startup.
2.  **Handshake:** Update `Neo.ai.Client` to send a `register` payload upon WebSocket connection, including:
    *   `appWorkerId`
    *   `isSharedWorker` boolean
    *   `userAgent`
    *   `environment`
3.  **ConnectionService:** Update registry to track sessions by `appWorkerId` (or map socket ID to this metadata).
4.  **Tool:** Implement `get_worker_topology` to list connected workers.


## Timeline

- 2025-12-28T14:24:50Z @tobiu added the `enhancement` label
- 2025-12-28T14:24:50Z @tobiu added the `ai` label
- 2025-12-28T14:24:50Z @tobiu added the `architecture` label
- 2025-12-28T14:25:49Z @tobiu added parent issue #8169
- 2025-12-28T14:27:29Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-28T14:53:45Z

we enhanced `core.Base` to enable uids inside the static config block:

```javascript
    construct(config={}) {
        let me = this;

        Object.defineProperties(me, {
            [configSymbol]: {
                configurable: true,
                enumerable  : false,
                value       : {},
                writable    : true
            },
            [isInstance]: {
                enumerable: false,
                value     : true
            }
        });

        me.id = config.id || me.constructor.config.id || IdGenerator.getId(this.getIdKey());
        delete config.id;
```
=> the ctor check is new.

- 2025-12-28T14:54:14Z @tobiu referenced in commit `9053f90` - "#8173 app worker uid"
- 2025-12-28T15:29:06Z @tobiu referenced in commit `58c6e6f` - "#8171 and #8173 in combination"
### @tobiu - 2025-12-28T15:29:50Z

**Input from Gemini 3:**

> ✦ **Implementation Complete**
> 
> I have established the foundation for unique App Worker identification and topology discovery.
> 
> **Changes:**
> 1.  **Core (`src/core/Base.mjs`)**: Updated `construct` to allow `static config.id` to act as a fallback instance ID.
> 2.  **Worker (`src/worker/App.mjs`)**:
>     *   Set `id` to `crypto.randomUUID()` in `static config`, ensuring every App Worker instance has a unique, persistent identity (`appWorkerId`).
> 3.  **Client (`src/ai/Client.mjs`)**:
>     *   Implemented `register` handshake in `onSocketOpen`.
>     *   Sends `appWorkerId`, `isSharedWorker`, `userAgent`, and `environment` to the MCP Server.
> 4.  **Server (`ConnectionService.mjs`)**:
>     *   Renamed internal `windowId` to `sessionId` to correctly reflect Socket semantics.
>     *   Implemented `sessionData` map to store metadata from `register` handshake.
>     *   Implemented `getWorkerTopology` tool to return the list of connected workers.
> 5.  **OpenAPI & Tools**:
>     *   Added `/worker/topology` endpoint.
>     *   Mapped `get_worker_topology` in `toolService.mjs`.
> 
> **Verification:**
> *   `test_connection_service.mjs` passes.
> *   Server correctly initializes and listens.
> 
> Ready for review.

- 2025-12-28T15:30:11Z @tobiu closed this issue

