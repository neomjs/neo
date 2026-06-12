---
id: 9586
title: 'Analysis: Robust Multi-Window LivePreview Routing & Base Path Resolution'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-27T15:08:01Z'
updatedAt: '2026-03-27T17:51:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9586'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T17:51:35Z'
---
# Analysis: Robust Multi-Window LivePreview Routing & Base Path Resolution

# Background
During v12.1.0 development, we deleted `src/code/LivePreview.mjs#beforeSetWindowUrl`. This manual path calculation was originally added in #8074 to solve Windows OS path separator issues and nested "recursive" popouts. However, mapping the SharedWorker's `basePath` upward directly to the repo root fundamentally stripped out environment prefixes like `dist/development/`.

# Current State
The system now relies entirely on the Main thread's native browser relative URL resolution (e.g., evaluating `./childapps/preview/index.html` strictly against `location.href`). Initial macOS testing confirms that this successfully resolves for popouts executed from both the Portal Home route and the Learn route, preventing environment-jumping bugs.

# Risk & Verification Plan
We must perform a matrix validation to ensure the native Main thread resolution handles all historical edge cases:
1. **OS Matrix Verification:** Ensure the Windows OS path separator (`\`) bug (#9365) does not regress without the manual split/join logic.
2. **App Depth Verification:** Test popping out `LivePreview` components located in apps with varying structural depths (e.g., `apps/portal` vs `examples/component/button`).
3. **Environment Matrix Verification:** Test popouts across all environments: `development` (raw), `dist/development` (bundled), and `dist/production`.
4. **Recursive Popout Verification:** Verify that popping out a component *from inside* an already-popped-out childapp (Window 2 -> Window 3) evaluates the deep relative path correctly without generating 404 URL loops (e.g., `childapps/preview/childapps/preview/`).

## Timeline

- 2026-03-27T15:08:03Z @tobiu added the `enhancement` label
- 2026-03-27T15:08:03Z @tobiu added the `ai` label
- 2026-03-27T15:08:03Z @tobiu added the `architecture` label
- 2026-03-27T15:09:39Z @tobiu cross-referenced by #9585
- 2026-03-27T15:10:14Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-27T17:50:47Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ > **Resolution Summary:**
> > The `LivePreview` multi-window regression has been successfully resolved. 
> > 
> > **Root Cause:**
> > The issue stemmed from a timing race condition where `MainThreadAddons` (like `ResizeObserver`) were not fully imported into the newly spawned popup window before the `RemoteMethodAccess` (RMA) mixin attempted to interface with them. This occurred because the `App` worker was caching the addon requests at the application level, bypassing the `importAddon` step for additional windows once the addon was loaded in the initial window.
> > 
> > **Fixes Implemented:**
> > 1.  **`src/worker/App.mjs`:** Refactored `getAddon()` to track addon loading on a per-window basis (`${addonName}X${windowId}`). This guarantees that when a component is moved to a new popout window (e.g., in `LivePreview`), the worker explicitly invokes `Neo.Main.importAddon` for that specific `windowId`.
> > 2.  **`src/Main.mjs`:** Ensured the `registerAddon()` method behaves idempotently. Dynamically importing an addon that is already registered no longer clobbers existing instances, avoiding unnecessary errors.
> > 3.  **Validation:** Implemented a new Playwright E2E test suite (`test/playwright/e2e/LivePreviewMultiWindow.spec.mjs`) that structurally validates the popout functionality across all three environments (`Dev`, `Dist Dev`, and `Dist Prod`) and both route contexts (`Home` and `Learn`), specifically asserting against "Invalid remote namespace" errors.
> > 
> > All matrix evaluations are currently passing!

- 2026-03-27T17:51:32Z @tobiu referenced in commit `0c9adee` - "test: Add LivePreview multi-window E2E validation (#9586)

fix: Resolve LivePreview popout window regression with dynamically loaded addons (#9586)"
- 2026-03-27T17:51:35Z @tobiu closed this issue
- 2026-03-27T18:03:45Z @tobiu referenced in commit `c34eb32` - "test: Add sequential route validation for LivePreview (#9586)"

