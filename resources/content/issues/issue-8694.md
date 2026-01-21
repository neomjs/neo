---
id: 8694
title: 'Service Worker: Robust Version Synchronization (Boot Check & 404 Recovery)'
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-16T04:39:30Z'
updatedAt: '2026-01-16T04:45:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8694'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T04:45:33Z'
---
# Service Worker: Robust Version Synchronization (Boot Check & 404 Recovery)

To strictly enforce version synchronization between the Client (App/Main) and the Service Worker, ensuring users never get stuck in a "Zombie" state (Old App + New SW + Deleted Assets):

1.  **Boot-Time Version Check:**
    -   Update `ServiceBase` to handle `getVersion` message.
    -   Update `main.addon.ServiceWorker` to query the SW version upon connection.
    -   If `Client.version !== SW.version`, trigger immediate `location.reload(true)`.

2.  **Runtime 404 Recovery (Safety Net):**
    -   Update `ServiceBase.onFetch` to intercept 404s on guarded paths (`dist/production`, etc.).
    -   If a 404 occurs (implying a race condition where SW updated mid-session or cache was lost), send `Neo.Main.reloadWindow({force: true})` to the client.
    -   Throttle this to prevent loops.

This two-pronged approach ensures:
-   **Fast Failure:** We catch the mismatch at boot time before assets fail.
-   **Resilience:** We recover if the update happens during the session.

## Timeline

- 2026-01-16T04:39:31Z @tobiu added the `enhancement` label
- 2026-01-16T04:39:31Z @tobiu added the `ai` label
- 2026-01-16T04:39:31Z @tobiu added the `core` label
- 2026-01-16T04:44:59Z @tobiu referenced in commit `76f0d23` - "enhancement: Service Worker: Robust Version Synchronization (Boot Check & 404 Recovery) (#8694)"
### @tobiu - 2026-01-16T04:45:11Z

**Input from Gemini 3 Pro:**

> ✦I have implemented the robust version synchronization strategy.
> 
> **Changes Implemented:**
> 
> 1.  **Boot-Time Version Check (`src/main/addon/ServiceWorker.mjs`):**
>     -   Upon establishing a connection with the Service Worker, the client now queries the SW version (`getVersion` action).
>     -   If a mismatch is detected (`Client.version !== SW.version`), the client immediately triggers `location.reload(true)` to fetch fresh assets. This prevents the "Zombie App" state at the earliest possible moment.
> 
> 2.  **Runtime 404 Recovery (`src/worker/ServiceBase.mjs`):**
>     -   Implemented `on404(event)` handler in `ServiceBase`.
>     -   Updated `onFetch` to invoke `on404` when a request returns status 404.
>     -   Configured to guard critical paths: `/dist/production/`, `/dist/esm/`, and `/src/`.
>     -   If a 404 occurs on these paths, the SW sends a `remoteMethod` message to `Neo.Main.reloadWindow` with `force: true`.
>     -   Added a 5-second throttle (`lastReload`) to prevent infinite reload loops in case of persistent server errors.
> 
> 3.  **Core Support (`src/Main.mjs`):**
>     -   Updated `Neo.Main.reloadWindow` to accept a `{force: true}` parameter, which maps to `location.reload(true)`.
> 
> **Outcome:**
> Users encountering a version mismatch (either at boot due to stale index, or mid-session due to an update) will now experience a single automatic hard reload instead of a crash or blank page. The system is protected against infinite loops.

- 2026-01-16T04:45:33Z @tobiu closed this issue
- 2026-01-16T04:45:51Z @tobiu assigned to @tobiu

