---
id: 8284
title: Implement Smart Lifecycle Management for ChromaDB processes
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-02T03:28:26Z'
updatedAt: '2026-01-02T03:35:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8284'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-02T03:35:07Z'
---
# Implement Smart Lifecycle Management for ChromaDB processes

The current database tools place an unnecessary burden on the agent to manage process lifecycle and do not clearly distinguish between managed and external instances.

**Requirements:**

1. **Auto-Cleanup (Code):** 
   - Update `DatabaseLifecycleService.mjs` in both the **Memory Core** (`ai/mcp/server/memory-core`) and **Knowledge Base** (`ai/mcp/server/knowledge-base`) servers.
   - Add process listeners (`SIGINT`, `SIGTERM`, `exit`) to automatically kill `this.chromaProcess` **if and only if** it exists (i.e., this server is the owner).
   - Ensure "client-only" mode (connecting to external DB) remains unaffected by these listeners.

2. **Tool Repositioning (Docs):**
   - Update `openapi.yaml` for both **Memory Core** and **Knowledge Base** servers.
   - **`stop_database`:** Mark as a debug/maintenance tool. Clarify that manual invocation is rarely needed due to auto-cleanup, and that it has no effect on external databases.
   - **`start_database`:** Clarify "connect or start" behavior.
   - **Guidance:** Add a note advising that for multi-agent workflows, an externally managed database (via `npm run ai:server-memory`) prevents unexpected disconnects when the "owner" agent exits.

**Goal:** Agents should no longer feel compelled to call `stop_database` at the end of a session, and "zombie" processes should be prevented for managed instances.

## Timeline

- 2026-01-02T03:28:27Z @tobiu added the `enhancement` label
- 2026-01-02T03:28:27Z @tobiu added the `ai` label
- 2026-01-02T03:29:05Z @tobiu assigned to @tobiu
- 2026-01-02T03:34:49Z @tobiu referenced in commit `d735874` - "Implement Smart Lifecycle Management for ChromaDB processes #8284"
- 2026-01-02T03:35:07Z @tobiu closed this issue

