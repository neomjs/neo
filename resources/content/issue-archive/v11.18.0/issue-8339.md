---
id: 8339
title: Remote Method Registration Missing for Secondary Windows in SharedWorker
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-05T20:03:47Z'
updatedAt: '2026-01-05T20:27:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8339'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T20:27:58Z'
---
# Remote Method Registration Missing for Secondary Windows in SharedWorker

**Context:**
In a `useSharedWorkers: true` environment, a single worker instance (e.g., App, Data) serves multiple connected browser windows (Main Threads).

**The Problem:**
Currently, `Neo.core.Base#initRemote()` sends the `registerRemote` message **only once** when the singleton is first initialized. 
- **Window 1 Connects:** Worker starts -> Singleton created -> `initRemote` called -> `registerRemote` sent to Window 1. Correct.
- **Window 2 Connects:** Worker is *already running* -> Singleton *already exists* -> `initRemote` is NOT called again. 
- **Result:** Window 2 never receives the `registerRemote` handshake. It has no proxies for the singleton's remote methods.

**Impact:**
- Any singleton remote method calls from secondary windows will fail.
- Critical for Multi-Window Apps (Infinite Canvas, Portal, SharedCovid).

**Proposed Solution:**
1.  **State Persistence:** In `Neo.core.Base#initRemote`, if `target === 'main'` and we are in a SharedWorker, store the registration payload (`className`, `methods`) in a registry on `Neo.currentWorker` (e.g., `remoteMethodRegistry`).
2.  **Replication:** In `Neo.worker.Base#onConnected` (which fires every time a new window connects), iterate through this registry and re-send all stored `registerRemote` messages to the *newly connected port only*.

**Scope:**
- `src/core/Base.mjs`: Update `initRemote` to register payloads.
- `src/worker/Base.mjs`: Add registry storage and update `onConnected` to replay them.


## Timeline

- 2026-01-05T20:03:47Z @tobiu added the `bug` label
- 2026-01-05T20:03:47Z @tobiu added the `ai` label
- 2026-01-05T20:03:48Z @tobiu added the `core` label
- 2026-01-05T20:03:59Z @tobiu assigned to @tobiu
- 2026-01-05T20:26:48Z @tobiu referenced in commit `c3a4e13` - "Remote Method Registration Missing for Secondary Windows in SharedWorker #8339"
### @tobiu - 2026-01-05T20:27:31Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix for remote method registration in SharedWorker environments.
> 
> **Key Changes:**
> 
> 1.  **State Persistence (`src/worker/Base.mjs`):**
>     -   Added `remotesToRegister` array to `Neo.worker.Base`.
>     -   In `onConnected`, the worker now iterates through this array and sends `registerRemote` messages to the newly connected port. This ensures that every new window receives the necessary proxy definitions.
> 
> 2.  **Registration Logic (`src/core/Base.mjs`):**
>     -   Updated `initRemote` to populate `Neo.currentWorker.remotesToRegister` when running in a SharedWorker environment.
>     -   Refactored the connection logic to be more robust: it now unconditionally registers the remote (if applicable) and then awaits the `connected` event if the worker is not yet ready, before proceeding to `promiseRemotes`.
> 
> **Verification:**
> -   Verified that multi-window applications now correctly receive remote method proxies in secondary windows.
> -   Confirmed that existing Dedicated Worker workflows and tests remain unaffected.
> 

- 2026-01-05T20:27:58Z @tobiu closed this issue
- 2026-01-10T11:28:20Z @tobiu cross-referenced by #8497

