---
id: 8119
title: Refactor Canvas interactions to RMA & Support Return Value Transfers
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-15T23:00:37Z'
updatedAt: '2025-12-15T23:46:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8119'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-15T23:46:18Z'
---
# Refactor Canvas interactions to RMA & Support Return Value Transfers

This is an exploration quest to refactor the manual worker messaging in the `OffscreenCanvas` implementation to use `RemoteMethodAccess` (RMA), and to enhance RMA to support transferring return values.

## Objectives

1.  **Refactor `Neo.worker.Canvas` interactions**:
    *   Convert `retrieveCanvas` and `registerCanvas` in `src/worker/Canvas.mjs` to be exposed via the `remote` config.
    *   Update `src/component/Canvas.mjs` to call these methods directly via the proxy (e.g., `Neo.worker.Canvas.retrieveCanvas(...)`) instead of using `promiseMessage`.

2.  **Enhance `Neo.worker.mixin.RemoteMethodAccess`**:
    *   **Challenge**: Currently, the `resolve` method in RMA does not support defining a `transfer` array for the return value. This prevents `Neo.main.DomAccess.getOffscreenCanvas` from being converted to RMA, as it needs to transfer the `OffscreenCanvas` back to the caller.
    *   **Goal**: Modify `src/worker/mixin/RemoteMethodAccess.mjs` (specifically the `resolve` and `onRemoteMethod` logic) to detect if a return value includes transferables (e.g., via a specific return structure like `{ data: result, transfer: [...] }`) and handle the message posting with the transfer list accordingly.

## Benefits
-   Reduces boilerplate code in components (no more manual `promiseMessage` construction).
-   Provides a cleaner, more method-oriented API for cross-worker operations.
-   Unlocks RMA usage for all future methods that need to return transferables (e.g., ImageBitmap, ArrayBuffer).

## Context
Discussion originated from the refactoring of OffscreenCanvas support for shared workers (#8118).

## Timeline

- 2025-12-15T23:00:38Z @tobiu added the `enhancement` label
- 2025-12-15T23:00:38Z @tobiu added the `ai` label
- 2025-12-15T23:00:38Z @tobiu added the `refactoring` label
- 2025-12-15T23:00:38Z @tobiu added the `architecture` label
- 2025-12-15T23:04:41Z @tobiu assigned to @tobiu
- 2025-12-15T23:42:26Z @tobiu referenced in commit `c31a128` - "Refactor Canvas interactions to RMA & Support Return Value Transfers #8119"
### @tobiu - 2025-12-15T23:42:34Z

**Input from Gemini 2.5 pro:**

> ✦ Refactoring completed successfully.
> 
> **Implementation Details:**
> 
> 1.  **`src/worker/mixin/RemoteMethodAccess.mjs`**:
>     *   Enhanced `resolve()` to support a return value structure `{ result: ..., transfer: [...] }`.
>     *   If `transfer` array is present, it unwraps `result` as the message payload and passes `transfer` to `postMessage`.
>     *   If `transfer` is absent, it sends the return value as-is.
> 
> 2.  **`src/main/DomAccess.mjs`**:
>     *   Exposed `getOffscreenCanvas` via RMA.
>     *   Success case: Returns `{ result: { offscreen }, transfer: [offscreen] }`.
>     *   Error case (Already Transferred): Returns `{ transferred: true }`.
> 
> 3.  **`src/worker/Canvas.mjs`**:
>     *   Exposed `registerCanvas` and `retrieveCanvas` via RMA.
>     *   Removed manual `sendMessage` calls.
> 
> 4.  **`src/component/Canvas.mjs`**:
>     *   Updated to use `Neo.main.DomAccess.getOffscreenCanvas` and `Neo.worker.Canvas.*` methods.
>     *   Logic handles the `{ transferred: true }` response correctly to fallback to worker retrieval in shared worker mode.
> 
> Verified with logs confirming correct data flow for both new canvas transfer and re-integration scenarios.

- 2025-12-15T23:46:18Z @tobiu closed this issue

