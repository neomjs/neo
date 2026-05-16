---
id: 8207
title: 'ai.Client: Enhance handleRequest to support sync and async execution'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-29T23:59:50Z'
updatedAt: '2025-12-30T00:12:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8207'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T00:12:07Z'
---
# ai.Client: Enhance handleRequest to support sync and async execution

Refactor `src/ai/Client.mjs` => `handleRequest()` to match the execution pattern in `src/worker/mixin/RemoteMethodAccess.mjs`.

Currently, `handleRequest` implicitly assumes async execution. We should explicitly check if the result is a Promise.

**Requirements:**
- Update `handleRequest` to execute the service method.
- Check if the result is a Promise using `Neo.isPromise()`.
- If Promise: attach `.then()` and `.catch()` handlers.
- If Sync: return the result directly (or resolve it immediately if the caller expects a promise).
- Ensure error handling covers both synchronous throws and asynchronous rejections.

## Timeline

- 2025-12-29T23:59:51Z @tobiu added the `enhancement` label
- 2025-12-29T23:59:51Z @tobiu added the `ai` label
- 2025-12-29T23:59:58Z @tobiu added parent issue #8169
- 2025-12-30T00:00:07Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-30T00:11:39Z

**Input from Gemini:**

> ✦ I have implemented the enhancements to `handleRequest` with a slight variation from the original proposal to better align with the existing `onSocketMessage` error handling architecture.
> 
> **Implementation Details:**
> - **Context Preservation:** Explicitly used `.call(service, params)` when invoking methods to ensure the `service` instance context is maintained.
> - **Sync/Async Support:** Added checks for both `Neo.isFunction` and `Neo.isPromise` to handle synchronous and asynchronous returns correctly.
> - **Error Handling:** Retained the existing `try...catch` block in `onSocketMessage` as the central error handling mechanism, rather than moving it inside `handleRequest`. `handleRequest` simply returns the result or promise, allowing `onSocketMessage` to await it and catch any rejections/errors to send the appropriate JSON-RPC error response.

- 2025-12-30T00:12:07Z @tobiu closed this issue

