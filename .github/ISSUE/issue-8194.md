---
id: 8194
title: 'Feat: Neural Link - Propagate Runtime Errors to Agent'
state: OPEN
labels:
  - bug
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-28T22:17:20Z'
updatedAt: '2025-12-28T22:17:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8194'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2025-12-28 @tobiu added the `bug` label
- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label

