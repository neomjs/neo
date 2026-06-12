---
id: 8001
title: Implement App Worker MCP Server PoC (Neural Link)
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-03T01:50:40Z'
updatedAt: '2025-12-03T02:14:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8001'
author: tobiu
commentsCount: 0
parentIssue: 7960
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-03T02:14:18Z'
---
# Implement App Worker MCP Server PoC (Neural Link)

A Proof of Concept (PoC) has been implemented to establish a bidirectional communication channel between Node.js agents and the Neo.mjs App Worker.

**Current Implementation (PoC):**
- **BridgeService:** A WebSocket server (`ai/mcp/server/app-worker/services/BridgeService.mjs`) running on port 8081.
- **MCP Server:** A basic MCP server (`ai/mcp/server/app-worker/Server.mjs`) exposing `bridgeReady` and `bridgeEvaluate` tools.
- **SDK:** `AppWorker_BridgeService` exported in `ai/services.mjs`.
- **Verification:** A test script `ai/examples/test-app-worker.mjs` was created.

**Known Issues & Refactoring Requirements:**
1.  **Namespace Convention:** `Neo.ai.mcp.server.app_worker` uses underscores; should be `app-worker` to match folder structure and existing patterns (e.g., `knowledge-base`).
2.  **Example App:** The PoC modified `examples/button/base`, which is incorrect. A dedicated example app (e.g., `examples/ai/bridge`) must be created for testing.
3.  **Dependencies:** `ws` was added to `devDependencies` but should be managed more carefully (optional dependency).
4.  **Architecture:** `BridgeService` spawning the WebSocket server directly in `construct`/`start` needs review. It should likely be a separate concern or class.
5.  **Tool Registration:** Manual tool registration in `Server.mjs` should be replaced with `Neo.ai.mcp.ToolService`.

**Next Steps:**
- Rename namespaces.
- Create a dedicated test example.
- Refactor `Server.mjs` to use `ToolService`.
- Clean up dependencies.

## Timeline

- 2025-12-03T01:50:41Z @tobiu added the `documentation` label
- 2025-12-03T01:50:41Z @tobiu added the `enhancement` label
- 2025-12-03T01:50:41Z @tobiu added the `ai` label
- 2025-12-03T01:50:42Z @tobiu added the `refactoring` label
- 2025-12-03T01:52:12Z @tobiu assigned to @tobiu
- 2025-12-03T01:56:08Z @tobiu added parent issue #7960
- 2025-12-03T02:07:47Z @tobiu referenced in commit `6d78b50` - "Implement App Worker MCP Server PoC (Neural Link) #8001"
- 2025-12-03T02:14:18Z @tobiu closed this issue

