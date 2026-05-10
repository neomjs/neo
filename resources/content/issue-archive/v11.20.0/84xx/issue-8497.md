---
id: 8497
title: 'ServiceWorker: Implement Remote Method Broadcast and Replay for Multi-Client Support'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-10T11:28:19Z'
updatedAt: '2026-01-10T11:36:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8497'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T11:36:29Z'
---
# ServiceWorker: Implement Remote Method Broadcast and Replay for Multi-Client Support

The Service Worker does not properly propagate remote method registration to multiple connected clients (App Workers) or handle new connections after initialization.

**The Problem:**
1.  **Multi-Client Support:** `Neo.core.Base.promiseRemotes` targets 'app', but in a Service Worker context, 'app' represents *any* connected client. The current logic attempts to send to a single port, missing others.
2.  **Future Clients:** `initRemote` runs once on startup. Clients connecting *after* startup (e.g., opening a new tab) never receive the `registerRemote` message and cannot access Service Worker methods.
3.  **Initialization Crash:** `promiseRemotes` fails if called when no clients are connected (because `sendMessage` returns null), rejecting the initialization promise.

**Proposed Solution:**
Adopt the "Registry & Replay" pattern used for SharedWorkers (#8339).

1.  **`src/core/Base.mjs` (initRemote):**
    -   Detect `Neo.workerId === 'service'`.
    -   Store `remote.app` definitions in `Neo.currentWorker.remotesToRegister`.

2.  **`src/worker/ServiceBase.mjs`:**
    -   Add `remotesToRegister = []`.
    -   Update `createMessageChannel` (triggered by `onConnect`) to iterate `remotesToRegister` and send `registerRemote` to the new client's port.
    -   Refine `hasWorker('app')` to return `true` *only* if active ports exist, preventing `promiseRemotes` from failing when no clients are connected.

This ensures every client—existing or new—receives the remote method definitions.

## Timeline

- 2026-01-10T11:28:20Z @tobiu added the `bug` label
- 2026-01-10T11:28:20Z @tobiu added the `ai` label
- 2026-01-10T11:28:20Z @tobiu added the `core` label
- 2026-01-10T11:28:25Z @tobiu assigned to @tobiu
- 2026-01-10T11:35:51Z @tobiu referenced in commit `37a786f` - "fix: Implement Service Worker remote method broadcast and replay (#8497)"
### @tobiu - 2026-01-10T11:36:08Z

**Input from tobiu:**

> ◆ Implemented the "Registry & Replay" pattern for Service Worker remote method registration.
> 
> **Changes:**
> 
> 1.  **`src/core/Base.mjs` (initRemote):**
>     -   Added detection for `Neo.workerId === 'service'`.
>     -   Now populates `Neo.currentWorker.remotesToRegister` with `remote.app` definitions instead of relying solely on `promiseRemotes` immediate execution.
> 
> 2.  **`src/worker/ServiceBase.mjs`:**
>     -   Added `remotesToRegister` array.
>     -   Updated `createMessageChannel` to iterate through `remotesToRegister` and post `registerRemote` messages to the newly connected port. This ensures every connecting client (tab) receives the remote method proxies.
>     -   Refined `hasWorker(name)` to strict mode (`!!this.getPort(name) || !!this.lastClient`), removing the hardcoded `name === 'app'` check. This prevents `promiseRemotes` from falsely attempting to send messages when no clients are actually connected, preventing initialization errors.
> 
> This ensures robust remote method availability across all connected windows and tabs.

- 2026-01-10T11:36:30Z @tobiu closed this issue

