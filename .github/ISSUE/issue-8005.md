---
id: 8005
title: Implement NeuralLinkService (Node.js)
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2025-12-03T09:55:39Z'
updatedAt: '2025-12-03T10:16:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8005'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement NeuralLinkService (Node.js)

**Goal:** Create the server-side foundation for the Neural Link.

**Requirements:**
1.  Create `ai/mcp/server/app-worker/service/NeuralLink.mjs`.
2.  Implement a standalone WebSocket Server (default port 8081).
3.  Manage active sessions (Window IDs).
4.  Route **JSON-RPC 2.0** messages to/from specific windows.
5.  Emit events (`connected`, `disconnected`, `message`) for the MCP Tool to consume.
6.  Ensure it runs independently of the MCP tool logic.

**Parent Issue:** #7960

## Comments

### @tobiu - 2025-12-03 10:16

**Input from Antigravity:**

> ◆ **CORRECTION: Architectural & Naming Refinement**
> 
> Following a deep dive and architecture review, the requirements for this ticket are updated as follows:
> 
> 1.  **Scope**: This service will be implemented as a specialized **MCP Server** (or integrated Service) to align with the existing `ai/Agent.mjs` ecosystem.
> 2.  **Location**: `ai/mcp/server/neural-link/Service.mjs` (or similar).
> 3.  **Protocol**: Strict **JSON-RPC 2.0** over WebSocket.
> 

## Activity Log

- 2025-12-03 @tobiu added the `enhancement` label
- 2025-12-03 @tobiu added the `ai` label
- 2025-12-03 @tobiu added the `architecture` label

