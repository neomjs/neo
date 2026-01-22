---
id: 8805
title: Harden Core Components against Async Destruction
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-19T11:06:31Z'
updatedAt: '2026-01-19T11:18:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8805'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T11:18:33Z'
---
# Harden Core Components against Async Destruction

**Goal:** Harden Core Framework Components against asynchronous destruction to prevent memory leaks and runtime errors when a component is destroyed while an async operation (fetch, XHR) is pending.

**Scope:**
1.  **`src/container/Base.mjs`**: Hardening `loadItems()`.
2.  **`src/form/field/FileUpload.mjs`**: Hardening `deleteDocument()`, `checkDocumentStatus()` and `upload()` (XHR).
3.  **`src/component/Circle.mjs`**: Refactoring `afterSetUrl` to async/await + `trap()`.
4.  **`src/component/Helix.mjs`**: Refactoring `afterSetUrl` to async/await + `trap()`.

**Implementation Details:**
-   Use `this.trap(promise)` to wrap `fetch` or `Neo.Xhr` calls.
-   Ensure XHR based logic (FileUpload) handles destruction gracefully (aborting XHR, ignoring callbacks).
-   Consistent use of `async/await` over `.then()`.


## Timeline

- 2026-01-19T11:06:32Z @tobiu added the `bug` label
- 2026-01-19T11:06:33Z @tobiu added the `ai` label
- 2026-01-19T11:06:33Z @tobiu added the `core` label
- 2026-01-19T11:17:54Z @tobiu referenced in commit `30acdd7` - "fix: Harden Core Components against Async Destruction (#8805)"
- 2026-01-19T11:18:05Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-19T11:18:16Z

**Input from Gemini 3 Pro:**

> ✦ I have hardened the core framework components against asynchronous destruction to prevent memory leaks and runtime errors.
> 
> **Summary of Changes:**
> 
> 1.  **`src/container/Base.mjs`**:
>     -   Hardened `loadItems()` by wrapping `fetch`, `response.json()`, and dynamic imports with `this.trap()`. This ensures that if the container is destroyed while loading items, the operation is safely cancelled.
> 
> 2.  **`src/form/field/FileUpload.mjs`**:
>     -   Wrapped `fetch` calls in `deleteDocument()` and `checkDocumentStatus()` with `this.trap()`.
>     -   Implemented a `destroy()` method to explicitly abort any active XHR uploads (`this.xhr.abort()`).
>     -   Added checks for `this.isDestroyed` in all XHR event handlers (`onUploadProgress`, `onUploadAbort`, `onUploadError`, `onUploadDone`) to prevent execution on dead instances.
> 
> 3.  **`src/component/Circle.mjs` & `src/component/Helix.mjs`**:
>     -   Refactored `loadData()` to use `async/await`.
>     -   Wrapped the `Neo.Xhr.promiseJson()` call with `this.trap()`.
>     -   Added error handling to specifically suppress logging if the error is `Neo.isDestroyed`.
> 
> **Verification:**
> 
> I created and ran a comprehensive suite of Playwright unit tests to verify these fixes:
> 
> -   `test/playwright/unit/container/AsyncLoadItems.spec.mjs`: Verifies `loadItems` rejection on destruction.
> -   `test/playwright/unit/form/field/FileUploadAsync.spec.mjs`: Verifies `deleteDocument` rejection on destruction.
> -   `test/playwright/unit/component/CircleAsync.spec.mjs`: Verifies `loadData` rejection on destruction.
> 
> All 8 tests (including the core infrastructure tests) passed successfully.

- 2026-01-19T11:18:33Z @tobiu closed this issue

