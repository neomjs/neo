---
id: 8695
title: 'Service Worker: Ensure Unmanaged Apps Handle Recovery Messages'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-16T04:52:15Z'
updatedAt: '2026-01-16T05:04:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8695'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T04:58:06Z'
---
# Service Worker: Ensure Unmanaged Apps Handle Recovery Messages

To ensure that applications which do not explicitly use the Service Worker addon (`useServiceWorker: false`) can still recover from "Zombie" states (404s) when running under the control of a Service Worker installed by another app (e.g., Portal):

**The Problem:**
If App A (Portal) installs a Service Worker, and then the user navigates to App B (SharedCovid, no SW config), the SW still controls App B.
If App B encounters a version mismatch (404 on assets), the SW sends a `reloadWindow` command.
However, because App B does not load `main.addon.ServiceWorker`, it has no listener on `navigator.serviceWorker.onmessage`.
The "Reload" command is ignored, and App B crashes with a blank page.

**The Solution:**
Move the `navigator.serviceWorker.onmessage` binding from the optional `ServiceWorker` addon to the core `WorkerManager`.
This ensures that **every** Neo.mjs application listens for Service Worker messages (like `reloadWindow`) if a SW is present, regardless of its own configuration.

**Changes:**
1.  Update `src/worker/Manager.mjs`: Bind `navigator.serviceWorker.onmessage` in `construct` if the API exists.
2.  Update `src/main/addon/ServiceWorker.mjs`: Remove the redundant binding.

## Timeline

- 2026-01-16T04:52:17Z @tobiu added the `bug` label
- 2026-01-16T04:52:17Z @tobiu added the `ai` label
- 2026-01-16T04:52:17Z @tobiu added the `core` label
- 2026-01-16T04:57:32Z @tobiu referenced in commit `bc520d7` - "bug: Service Worker: Ensure Unmanaged Apps Handle Recovery Messages (#8695)"
### @tobiu - 2026-01-16T04:57:43Z

**Input from Gemini 3 Pro:**

> ✦I have centralized the Service Worker communication logic to ensure all apps, managed or unmanaged, can handle recovery messages.
> 
> **Changes Implemented:**
> 
> 1.  **Refactored `src/worker/Manager.mjs` (Core Worker Manager):**
>     -   Added a `checkServiceWorkerVersion()` method that proactively queries the controlling Service Worker for its version and compares it with `Neo.config.version`. If a mismatch is found, it triggers a forced reload.
>     -   Updated the `construct()` method to:
>         -   Bind `navigator.serviceWorker.onmessage` to `WorkerManager.onWorkerMessage`. This ensures the Main Thread listens for Service Worker messages (like `reloadWindow`) **globally**, regardless of whether the app explicitly uses the Service Worker addon.
>         -   Call `checkServiceWorkerVersion()` immediately if a controller is present.
> 
> 2.  **Cleaned up `src/main/addon/ServiceWorker.mjs`:**
>     -   Removed the redundant `onmessage` binding and version check logic, as these are now handled by the core `WorkerManager`.
>     -   This addon now focuses solely on *registering* the Service Worker for apps that opt-in.
> 
> **Outcome:**
> Any Neo.mjs app running in a browser context controlled by a Neo Service Worker (even "unmanaged" apps like SharedCovid accessed after Portal) will now:
> 1.  Proactively detect version mismatches on boot.
> 2.  Correctly receive and execute `reloadWindow` commands sent by the Service Worker (e.g., in response to 404s).
> This closes the "Unmanaged App" vulnerability where the SW would send recovery commands into the void.

- 2026-01-16T04:57:53Z @tobiu assigned to @tobiu
- 2026-01-16T04:58:06Z @tobiu closed this issue
- 2026-01-16T05:03:49Z @tobiu referenced in commit `d3bd689` - "fix: Add throttle guard and documentation to Service Worker version sync (#8695)"
### @tobiu - 2026-01-16T05:04:41Z

**Input from Gemini 3 Pro:**

> ✦ Final refinement and safety guards implemented.
> 
> **Additional Improvements:**
> 
> 1.  **Infinite Loop Protection:**
>     -   Added a throttle mechanism to `checkServiceWorkerVersion` using `sessionStorage`.
>     -   If a reload was triggered by a version mismatch less than 5 seconds ago, the check aborts. This prevents infinite reload loops in case of persistent deployment errors (e.g., if the "new" version also believes it is mismatched or if the server is returning 404s for the new version's assets).
> 
> 2.  **Architectural Documentation:**
>     -   Added a **CRITICAL** comment block in `src/worker/Manager.mjs` explaining the "Unmanaged App" scenario.
>     -   This documents *why* we bind `navigator.serviceWorker.onmessage` even when `useServiceWorker` is false: to ensure that if a user navigates from a SW-controlled app (Portal) to a non-SW app (SharedCovid), the non-SW app can still receive and execute the `reloadWindow` recovery command sent by the persisting Service Worker. This prevents future regressions where developers might try to "optimize" this binding away.
> 
> The solution is now robust against race conditions, unmanaged app transitions, and persistent failure loops.


