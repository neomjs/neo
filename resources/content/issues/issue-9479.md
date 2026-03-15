---
id: 9479
title: 'Firefox Nightly R&D: OffscreenCanvas Worker-to-Worker Transfer Failure'
state: CLOSED
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-15T15:19:43Z'
updatedAt: '2026-03-15T20:48:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9479'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-15T16:03:11Z'
---
# Firefox Nightly R&D: OffscreenCanvas Worker-to-Worker Transfer Failure

**Browser:** Firefox Nightly (v150)
**Context:** Multi-threaded architecture (`SharedWorker` / `Worker`)

**The Problem:**
OffscreenCanvas elements render perfectly in Chrome and Safari, but fail to appear in Firefox Nightly. 

During our investigation, we found that transferring an `OffscreenCanvas` from the Main Thread to the App Worker, and then attempting to transfer it again from the App Worker to the Canvas Worker (via `MessageChannel`), fails silently in `SharedWorker` mode.

However, when switching to Dedicated Workers, Firefox throws this explicit internal error:
`NotSupportedError: Cannot transfer OffscreenCanvas bound to element using captureStream.`

We are *not* using `captureStream`. This indicates a core bug or architectural restriction in Firefox where it refuses to support chained or "Worker-to-Worker" transfers of `OffscreenCanvas` objects. 

Because the `OffscreenCanvas` is included in the `transfer` array of the `MessageChannel.postMessage` call, Firefox aborts the entire message serialization silently (in SharedWorkers). This completely severs the `registerCanvas` communication between the App Worker and Canvas Worker.

**Proposed Architectural Fix (Triangular Communication):**
We need to bypass the App Worker as the middleman for the transfer buffer. 
1. **App Worker -> Main Thread:** "Extract the OffscreenCanvas for ID X and send it directly to the Canvas Worker."
2. **Main Thread:** Calls `transferControlToOffscreen()`.
3. **Main Thread -> Canvas Worker:** Transfers the canvas directly (`dest: 'canvas'`).
4. **Canvas Worker -> App Worker (Ping):** "Canvas received!" (Resolves a promise in the App Worker).
5. **App Worker -> Canvas Worker:** Begins normal rendering instructions via direct `MessageChannel` (which is proven to work for VDom/Data when no canvas buffer is in the payload).

This R&D effort will determine if FF Nightly even supports transferring a canvas to a SharedWorker from Main, as the current silent failure leaves that ambiguous.

## Timeline

- 2026-03-15T15:20:29Z @tobiu added the `ai` label
- 2026-03-15T15:20:29Z @tobiu added the `bug` label
- 2026-03-15T15:20:29Z @tobiu added the `architecture` label
### @tobiu - 2026-03-15T15:22:32Z

**Input from Gemini 3.1 Pro:**

> ✦ **Implementation Blueprint:**
> 
> The fix requires changes across three distinct realms: Main, App Worker, and Canvas Worker.
> 
> 1. **Main Thread (`src/main/DomAccess.mjs`):**
>    * Currently, `getOffscreenCanvas` extracts the canvas and returns it to the caller (App Worker).
>    * We need a new method (e.g., `transferCanvasToWorker(data)`) or an enhancement to `getOffscreenCanvas`.
>    * It must extract the canvas, and then use `Neo.worker.Manager.sendMessage('canvas', ...)` to send the node directly to the Canvas Worker, bypassing the App Worker entirely.
> 
> 2. **Canvas Worker (`src/worker/Canvas.mjs` & `src/canvas/Base.mjs`):**
>    * The Canvas worker needs to receive this direct message from Main. 
>    * `Neo.worker.Canvas.registerCanvas` is currently a remote method called by App. We might need a direct message handler from Main to populate `me.canvasWindowMap[data.nodeId][data.windowId]`.
>    * Once received and registered, it needs to ping the App Worker back (using their direct `MessageChannel` port) to say "I have the canvas, you can proceed."
> 
> 3. **App Worker (`src/component/Canvas.mjs`):**
>    * The `afterSetMounted` loop currently calls `Neo.main.DomAccess.getOffscreenCanvas`, awaits it, and then calls `Neo.worker.Canvas.registerCanvas`.
>    * This logic must change:
>      a) Tell Main to transfer the canvas to the Canvas Worker.
>      b) `await` a ping/promise from the Canvas Worker confirming receipt.
>      c) Then set `me.offscreenRegistered = true`.

- 2026-03-15T15:22:41Z @tobiu assigned to @tobiu
- 2026-03-15T16:00:52Z @tobiu referenced in commit `b370522` - "feat: Implement Triangular Communication for OffscreenCanvas transfers to bypass Firefox Nightly SharedWorker bugs (#9479)"
- 2026-03-15T16:01:55Z @tobiu cross-referenced by PR #9480
### @tobiu - 2026-03-15T16:02:06Z

**Input from Gemini 3.1 Pro:**

> ✦ Implementation completed and verified across Chrome, Firefox Nightly, and Safari.
> 
> A pull request has been submitted: #9480
> 
> The solution successfully implements the Triangular Communication pattern as planned:
> 1. `Neo.component.Canvas` now pauses its registration sequence and waits for a direct callback.
> 2. `Neo.main.DomAccess#transferCanvasToWorker` extracts the canvas and sends it directly to the Canvas Worker.
> 3. `Neo.worker.Canvas#registerCanvasDirect` receives the payload and pings the App Worker via `action: 'canvasRegistered'`.
> 4. `Neo.worker.App#onCanvasRegistered` receives the ping and resolves the component's promise.
> 
> The failed unit test in `StoreFilterProfile.spec.mjs` is an unrelated performance benchmark timeout and not caused by these changes.

### @tobiu - 2026-03-15T16:02:49Z

before:

<img width="928" height="1221" alt="Image" src="https://github.com/user-attachments/assets/47daa857-9f96-41fe-86cd-2e90c22395b1" />

after:

<img width="934" height="1331" alt="Image" src="https://github.com/user-attachments/assets/1bb52e8b-2bd1-4890-9e11-15b459dfcac9" />

- 2026-03-15T16:03:12Z @tobiu closed this issue
- 2026-03-15T16:15:35Z @tobiu referenced in commit `bb64939` - "feat: Implement Triangular Communication for OffscreenCanvas transfers to bypass Firefox Nightly SharedWorker bugs (#9479) (#9480)"
### @tobiu - 2026-03-15T20:48:16Z

created a bugreport for the mozilla team here:
https://bugzilla.mozilla.org/show_bug.cgi?id=2023457


