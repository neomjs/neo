---
id: 7806
title: Fix add_memory failure when sessionId is omitted
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-19T11:54:56Z'
updatedAt: '2025-11-19T12:33:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7806'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T12:33:43Z'
---
# Fix add_memory failure when sessionId is omitted

The `add_memory` tool fails with a `422 Unprocessable Entity` error when the `sessionId` parameter is omitted. This violates the documented behavior (and typical MCP expectations) where a missing `sessionId` should either be auto-generated or handled gracefully.

**Steps to Reproduce:**
1. Ensure the Memory Core MCP server is running.
2. Call `add_memory` with valid `prompt`, `thought`, and `response`, but **omit** the `sessionId`.
3. Observe the tool error: `Error executing add_memory: 422: Unprocessable Entity`.

**Root Cause Analysis:**
The `MemoryService.addMemory` method likely attempts to insert `undefined` or `null` as the `sessionId` into the ChromaDB metadata. ChromaDB (or the validation layer) requires metadata values to be strings, numbers, or booleans, and strictly rejects `undefined`/`null`.

**Proposed Fix:**
Modify `ai/mcp/server/memory-core/services/SessionService.mjs` to manage a `currentSessionId` (UUID generated at startup). Update `MemoryService` to use this ID as a default when `sessionId` is missing. Expose this ID via `HealthService` for visibility.

**Implemented Solution:**
1.  **`SessionService.mjs`:** Added `currentSessionId` (UUID) initialized at startup.
2.  **`MemoryService.mjs`:** Updated `addMemory` to default to `SessionService.currentSessionId` if no `sessionId` is provided.
3.  **`HealthService.mjs`:** Updated `healthcheck` to include the `session.currentId` in its response payload.
4.  **`openapi.yaml`:** Updated documentation to reflect the optional `sessionId` parameter and the new `session` field in the healthcheck response.

**Verification:**
Verified that `healthcheck` returns the current session ID and that `add_memory` succeeds without a `sessionId` parameter, correctly using the default ID.

## Timeline

- 2025-11-19T11:54:56Z @tobiu added the `bug` label
- 2025-11-19T11:54:57Z @tobiu added the `ai` label
- 2025-11-19T12:33:05Z @tobiu assigned to @tobiu
- 2025-11-19T12:33:41Z @tobiu referenced in commit `a8e2066` - "Fix add_memory failure when sessionId is omitted #7806"
- 2025-11-19T12:33:44Z @tobiu closed this issue

