---
id: 9454
title: Implement Push-Based WebSocket Integration in Data Pipeline
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T20:16:18Z'
updatedAt: '2026-03-25T10:40:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9454'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-25T10:40:05Z'
---
# Implement Push-Based WebSocket Integration in Data Pipeline

### Goal
Natively support server-pushed data streams and Progressive Hydration via WebSockets within the Data Pipeline architecture.

### Context
Modern web apps use WebSockets to push data to clients (e.g., real-time dashboards, live task boards). Often, backends push "Operations" or "Deltas" (e.g., `{ target: 123, changes: { status: 'done' } }`) rather than full state objects. Currently, Neo's `WebSocket` connection handles request/response mapping via `mId` (Promises), but lacks a robust mechanism for persistent channel subscriptions and routing unsolicited pushes through the shaping pipeline.

### Acceptance Criteria

1. **`remotes-api.json` Enhancement:**
   - Differentiate between standard RPC `methods` (Request/Response) and `streams` (Persistent Subscriptions).
   - Allow `streams` to define their own `parser` and `normalizer` configs.

2. **Persistent Subscriptions (`manager.rpc.Message`):**
   - Implement logic to handle persistent subscriptions. Instead of a single-use Promise `mId`, the manager must register a persistent `callbackId` for a specific stream signature.
   - When a WebSocket message matching that stream arrives, it must trigger the registered callback repeatedly.

3. **Delta-Aware Parsing (Progressive Hydration):**
   - The Pipeline must be able to process stream pushes.
   - When a payload arrives via a stream, it enters the Data Worker Pipeline.
   - We need the architectural capacity for specialized Parsers (e.g., an Opcode Parser) that can read proprietary backend deltas and translate them into standardized Neo.mjs data commands (e.g., `{ action: 'update', recordId: '123', data: { status: 'done' } }`).

4. **Worker Boundary Routing:**
   - The shaped data (or parsed Delta) must be sent via IPC back to the App Worker's Pipeline.
   - The App Worker Pipeline fires an event (e.g., `push` or `update`) that a `Store` or `ViewController` can subscribe to.
   - A `Store` receiving a delta should call `record.set()` on the existing `Neo.data.Record` to trigger highly localized, surgical VDOM updates.

## Timeline

- 2026-03-12T20:16:19Z @tobiu added the `enhancement` label
- 2026-03-12T20:16:19Z @tobiu added the `ai` label
- 2026-03-12T20:16:19Z @tobiu added the `architecture` label
- 2026-03-12T20:16:19Z @tobiu added the `core` label
- 2026-03-12T20:18:45Z @tobiu added parent issue #9449
- 2026-03-12T21:00:08Z @tobiu cross-referenced by #9449
- 2026-03-12T21:04:21Z @tobiu assigned to @tobiu
- 2026-03-25T10:39:26Z @tobiu referenced in commit `8472a3e` - "feat: Implement Push-Based WebSocket Integration in Data Pipeline (#9454)"
### @tobiu - 2026-03-25T10:39:40Z

**Input from Gemini 3.1 Pro:**

> ✦ I have committed the implementation for the WebSocket integration as discussed.
> 
> **Actions Taken:**
> - **`src/data/connection/WebSocket.mjs`**: Added `streamCallbacks`, `registerStream()`, and `unregisterStream()` to support persistent channel subscriptions alongside single-use promises. Updated `onMessage` to route incoming pushes (`data.stream` or `data.method`) to these callbacks.
> - **`src/manager/rpc/Api.mjs`**: Enhanced `registerApi()` to recognize and store `streams` defined in `remotes-api.json`.
> - **`src/manager/rpc/Message.mjs`**: Added `onMessageStream()` and `onMessageStreamUnsubscribe()` to orchestrate persistent stream registrations down to the specific `WebSocket` connection.
> - **`src/worker/App.mjs`**: Added the `rpcStreamCallbacks` registry and the `onRpcStreamData()` handler. When the Data Worker forwards pushed data via IPC, the App Worker invokes the correct subscriber callback, completing the push cycle from server to UI.
> 
> The foundation is in place. As you mentioned, we should proceed with dedicated unit and e2e testing sessions to verify the Progressive Hydration flow end-to-end.

- 2026-03-25T10:40:05Z @tobiu closed this issue

