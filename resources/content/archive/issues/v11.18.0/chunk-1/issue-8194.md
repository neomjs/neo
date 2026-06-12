---
id: 8194
title: 'Feat: Neural Link - Propagate Runtime Errors to Agent'
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T22:17:20Z'
updatedAt: '2025-12-28T22:20:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8194'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T22:20:37Z'
---
# Feat: Neural Link - Propagate Runtime Errors to Agent

**Context:**
The current `Neo.ai.Client.onSocketMessage` implementation catches errors but only logs them to the console. It does not send an error response back to the Neural Link server.

**Problem:**
If `handleRequest` throws (e.g., "Component not found"), the server hangs waiting for a response that never comes. The agent perceives this as a timeout or a broken tool.

**Requirement:**
1.  Wrap `handleRequest` in a `try...catch`.
2.  In the `catch` block, call `sendResponse(data.id, {error: e.message})` (or a similar error structure compliant with JSON-RPC 2.0).
3.  Ensure the server handles JSON-RPC error responses correctly.

**Goal:**
Ensure agents receive explicit error feedback when a runtime operation fails.

## Timeline

- 2025-12-28T22:17:21Z @tobiu added the `bug` label
- 2025-12-28T22:17:21Z @tobiu added the `enhancement` label
- 2025-12-28T22:17:21Z @tobiu added the `ai` label
- 2025-12-28T22:18:17Z @tobiu assigned to @tobiu
- 2025-12-28T22:18:23Z @tobiu added parent issue #8169
- 2025-12-28T22:19:56Z @tobiu referenced in commit `7272d52` - "feat(ai): Propagate runtime errors to agent (#8194)

- Refactor `onSocketMessage` to catch errors from `handleRequest`.
- Implement `sendError` to transmit JSON-RPC 2.0 error responses.
- Ensures agents are not left waiting on timeouts when tool calls fail."
### @tobiu - 2025-12-28T22:20:07Z

**Input from Gemini:**

> ✦ I have implemented error propagation for the Neural Link.
> 
> **Changes in `src/ai/Client.mjs`:**
> 1.  **Enhanced `onSocketMessage`:** Now wraps `handleRequest` in a `try...catch` block.
> 2.  **Added `sendError`:** Sends a JSON-RPC 2.0 error response (Code -32603) with the exception message and stack trace.
> 
> **Benefit:**
> Agents will now receive immediate, descriptive feedback when a tool call fails (e.g., "Component not found"), enabling self-correction instead of timeouts.

- 2025-12-28T22:20:37Z @tobiu closed this issue

