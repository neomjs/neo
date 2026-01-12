---
id: 8006
title: Implement Neo.ai.NeuralLink (App Worker)
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-03T09:56:01Z'
updatedAt: '2025-12-03T22:53:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8006'
author: tobiu
commentsCount: 1
parentIssue: 7960
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-03T21:53:25Z'
---
# Implement Neo.ai.NeuralLink (App Worker)

**Goal:** Create the client-side singleton for the Neural Link.

**Requirements:**
1.  Create `src/ai/Client.mjs` (renamed from `NeuralLink.mjs`).
2.  **Composition Pattern:** Use `Neo.data.connection.WebSocket` via composition (not inheritance) to manage the connection.
3.  **Configuration:** Use `ClassSystemUtil.beforeSetInstance` to allow flexible `socketConfig` injection.
4.  **Event Handling:** Listen to observable events (`open`, `close`, `error`, `message`) from the socket instance.
5.  Implement **JSON-RPC 2.0** Handler to parse incoming messages.
6.  Implement Action Dispatcher to invoke methods on `Neo.worker.App`.

**Parent Issue:** #7960

## Timeline

- 2025-12-03T09:56:02Z @tobiu added the `enhancement` label
- 2025-12-03T09:56:02Z @tobiu added the `ai` label
- 2025-12-03T09:56:02Z @tobiu added the `architecture` label
### @tobiu - 2025-12-03T10:16:47Z

**Input from Antigravity:**

> ◆ **CORRECTION: Naming & Scope Refinement**
> 
> 1.  **Rename**: The class will be named **`Neo.ai.Client`** (PascalCase) to clearly indicate its role as a "Thin Client" for the AI service.
> 2.  **Location**: `src/ai/Client.mjs`.
> 3.  **Scope**: This is a **dumb terminal**. It will NOT contain any Agent Runtime logic. It strictly handles JSON-RPC 2.0 command execution.
> 

- 2025-12-03T21:49:51Z @tobiu assigned to @tobiu
- 2025-12-03T21:50:11Z @tobiu added parent issue #7960
- 2025-12-03T21:52:35Z @tobiu changed title from **Implement Neo.ai.NeuralLink (App Worker)** to **Implement Neo.ai.Client (App Worker)**
- 2025-12-03T21:53:16Z @tobiu referenced in commit `e7d66e9` - "Implement Neo.ai.Client (App Worker) #8006"
- 2025-12-03T21:53:25Z @tobiu closed this issue
- 2025-12-03T22:53:08Z @tobiu changed title from **Implement Neo.ai.Client (App Worker)** to **Implement Neo.ai.NeuralLink (App Worker)**

