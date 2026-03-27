---
id: 9564
title: Finalize Data Pipeline Push Integration & UI Reactivity
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-26T16:13:36Z'
updatedAt: '2026-03-26T17:12:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9564'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-26T17:12:33Z'
---
# Finalize Data Pipeline Push Integration & UI Reactivity

### Goal
Connect the lower-level WebSocket/Stream RPC mechanisms to the `Store` so that unsolicited server pushes surgically update UI components via `record.set()`.

### Context
In issue #9454, we implemented the plumbing for Progressive Hydration (WebSocket persistent subscriptions, RPC routing, IPC forwarding). However, we missed the final integration step: The `Store` itself is not listening for these pushes, and the pipeline abstraction lacks a dedicated `push` or `update` event to notify the store.

If a server pushes `{ id: 123, status: 'done' }` right now, it traverses the worker boundary but dies in the App Worker because the Store is only listening to `load` and `progress` (for chunking), not unsolicited `push` events.

### Acceptance Criteria

1.  **Connection Event Emission:**
    -   `src/data/connection/WebSocket.mjs` (and potentially `Rpc`) must fire a `push` event when unsolicited data arrives, rather than just executing hardcoded callbacks.

2.  **Pipeline Event Bridging:**
    -   `src/data/Pipeline.mjs` must relay `push` events from its connection to the outside world.
    -   It must run pushed data through the `parser` and `normalizer` before emitting `pipeline.fire('push', shapedData)`.
    -   It must correctly handle IPC forwarding for pushes when `workerExecution: 'data'`.

3.  **Store Integration (`record.set()`):**
    -   `src/data/Store.mjs` must listen to the `push` event on its pipeline.
    -   Implement `onPipelinePush(data)`. This method must locate the existing record via its primary key and call `record.set(data)` to trigger a surgical VDOM update without reloading the entire collection.

4.  **Unit Testing (`test/playwright/unit/data/`):**
    -   Create `PipelinePush.spec.mjs` to verify event bubbling, shaping, and IPC forwarding using mock connections.
    -   Create `StorePush.spec.mjs` to verify that a Store correctly interprets pipeline pushes and applies surgical updates via `record.set()`, triggering a `recordChange` event.

## Timeline

- 2026-03-26T16:13:38Z @tobiu added the `enhancement` label
- 2026-03-26T16:13:38Z @tobiu added the `ai` label
- 2026-03-26T16:13:38Z @tobiu added the `architecture` label
- 2026-03-26T16:13:38Z @tobiu added the `core` label
- 2026-03-26T16:14:06Z @tobiu added parent issue #9449
- 2026-03-26T16:14:07Z @tobiu assigned to @tobiu
- 2026-03-26T17:10:19Z @tobiu referenced in commit `53d3459` - "feat: Finalize Data Pipeline Push Integration & UI Reactivity (#9564)"
### @tobiu - 2026-03-26T17:11:46Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the final integration for the push-based data pipeline.
> 
> **Summary of Changes:**
> 1.  **`src/data/connection/Base.mjs`**: Made the base connection observable so that all connection types (including WebSocket) can emit custom events like `push`.
> 2.  **`src/data/connection/WebSocket.mjs`**: Now fires a `push` event when unsolicited data (Progressive Hydration) arrives without a matching callback or Promise `mId`.
> 3.  **`src/data/Pipeline.mjs`**: Implemented `onConnectionPush` to relay the push event from its underlying connection.
>     *   It passes the pushed data through the `parser` and `normalizer`.
>     *   If running in the Data Worker, it forwards the shaped data via IPC to the App Worker Pipeline.
> 4.  **`src/worker/App.mjs`**: Added `onPipelinePush(msg)` to catch the IPC forward and re-emit the `push` event on the correct proxy pipeline instance inside the App Worker.
> 5.  **`src/data/Store.mjs`**: The Store now listens to `push` events from its configured pipeline.
>     *   Added `onPipelinePush(data)`: It looks up the record by its primary key, and if it exists, it executes `record.set(data)`. This completes the flow and triggers the surgical VDOM update without reloading the grid or collection.
> 6.  **Unit Tests**: Added `PipelinePush.spec.mjs` and `StorePush.spec.mjs` to rigorously verify the event bubbling and the surgical `record.set()` updates using mock connections.
> 
> These changes have been committed and pushed to the repository. I will now close this issue.

- 2026-03-26T17:12:33Z @tobiu closed this issue

