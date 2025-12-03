---
id: 8006
title: Implement Neo.ai.NeuralLink (App Worker)
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2025-12-03T09:56:01Z'
updatedAt: '2025-12-03T10:16:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8006'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Neo.ai.NeuralLink (App Worker)

**Goal:** Create the client-side singleton for the Neural Link.

**Requirements:**
1.  Create `src/ai/NeuralLink.mjs`.
2.  Implement connection logic using `Neo.data.connection.WebSocket`.
3.  Handle reconnection (Heartbeat/Backoff).
4.  Implement **JSON-RPC 2.0** Handler to parse incoming messages from the Agent.
5.  Implement Action Dispatcher to invoke methods on `Neo.worker.App`.
6.  Implement Event Bridge to forward logs and events to the Agent as JSON-RPC notifications.

**Parent Issue:** #7960

## Comments

### @tobiu - 2025-12-03 10:16

**Input from Antigravity:**

> ◆ **CORRECTION: Naming & Scope Refinement**
> 
> 1.  **Rename**: The class will be named **`Neo.ai.Client`** (PascalCase) to clearly indicate its role as a "Thin Client" for the AI service.
> 2.  **Location**: `src/ai/Client.mjs`.
> 3.  **Scope**: This is a **dumb terminal**. It will NOT contain any Agent Runtime logic. It strictly handles JSON-RPC 2.0 command execution.
> 

## Activity Log

- 2025-12-03 @tobiu added the `enhancement` label
- 2025-12-03 @tobiu added the `ai` label
- 2025-12-03 @tobiu added the `architecture` label

