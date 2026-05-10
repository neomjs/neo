---
id: 8496
title: ServiceWorker missing hasWorker() method causes initRemote failure
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-10T11:17:30Z'
updatedAt: '2026-01-10T11:19:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8496'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T11:19:25Z'
---
# ServiceWorker missing hasWorker() method causes initRemote failure

The Service Worker fails to initialize remote methods because it lacks the `hasWorker()` method, which is required by `Neo.core.Base.promiseRemotes()`.

**The Error:**
```
Base.mjs:892 Uncaught (in promise) TypeError: origin.hasWorker is not a function
    at Base.mjs:892:28
    at Array.forEach (<anonymous>)
    at Base.promiseRemotes (Base.mjs:888:32)
    at ServiceWorker.initRemote (Base.mjs:648:24)
    at ServiceWorker.initRemote (ServiceBase.mjs:172:19)
    at ServiceWorker.onConnect (ServiceBase.mjs:203:14)
    at ServiceWorker.onRegisterNeoConfig (ServiceBase.mjs:297:14)
    at ServiceWorker.onMessage (ServiceBase.mjs:272:39)
```

**Root Cause:**
`Neo.core.Base.promiseRemotes()` checks `origin.hasWorker(worker)` before sending a message. In the context of a Service Worker, `origin` is the `ServiceWorker` instance itself (which extends `ServiceBase`). However, `ServiceBase` does not implement `hasWorker()`, unlike `Neo.worker.Base` and `Neo.worker.Manager`.

**Fix:**
Implement `hasWorker(name)` in `src/worker/ServiceBase.mjs`. Since the Service Worker communicates via `this.sendMessage`, which checks `channelPorts` or `lastClient`, the implementation should check if a valid destination exists.

For the Service Worker, a "worker" (destination) is available if:
1. It is 'app' (main communication channel).
2. We have a connected client or port for it.


## Timeline

- 2026-01-10T11:17:31Z @tobiu added the `bug` label
- 2026-01-10T11:17:31Z @tobiu added the `ai` label
- 2026-01-10T11:17:31Z @tobiu added the `core` label
- 2026-01-10T11:17:38Z @tobiu assigned to @tobiu
- 2026-01-10T11:18:54Z @tobiu referenced in commit `3e6aece` - "fix: Implement hasWorker() in ServiceBase to allow initRemote calls (#8496)"
### @tobiu - 2026-01-10T11:19:03Z

**Input from tobiu:**

> ◆ Implemented `hasWorker(name)` in `src/worker/ServiceBase.mjs`.
> 
> This method is required by `Neo.core.Base.promiseRemotes()` to check if a target worker (destination) is available before sending a message.
> 
> **Implementation Details:**
> - `hasWorker(name)` returns `true` if:
>     - The destination is 'app' (the main channel).
>     - A specific message port exists for the destination.
>     - A fallback client (`lastClient`) is available.
> 
> This fix ensures that `initRemote()` calls within the Service Worker context no longer throw `TypeError: origin.hasWorker is not a function`.

- 2026-01-10T11:19:25Z @tobiu closed this issue

