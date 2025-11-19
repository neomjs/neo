---
id: 7806
title: Fix add_memory failure when sessionId is omitted
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2025-11-19T11:54:56Z'
updatedAt: '2025-11-19T11:54:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7806'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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
Modify `ai/mcp/server/memory-core/services/MemoryService.mjs` to:
1. Detect if `sessionId` is missing.
2. If missing, generate a default `sessionId` (e.g., using a timestamp-based string like `session_${Date.now()}`).
3. Ensure this generated ID is used in both the metadata and the returned response.

**File to Modify:**
`ai/mcp/server/memory-core/services/MemoryService.mjs`

**Verification:**
After the fix, calling `add_memory` without a `sessionId` should succeed and return a valid, generated session ID.

## Activity Log

- 2025-11-19 @tobiu added the `bug` label
- 2025-11-19 @tobiu added the `ai` label

