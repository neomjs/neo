---
id: 8002
title: Refactor App Worker MCP Server to use ToolService
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
assignees: []
createdAt: '2025-12-03T01:50:52Z'
updatedAt: '2025-12-03T01:50:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8002'
author: tobiu
commentsCount: 0
parentIssue: 7960
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor App Worker MCP Server to use ToolService

The current PoC for the App Worker MCP Server manually registers tools in `Server.mjs`. This violates the DRY principle and ignores the existing `Neo.ai.mcp.ToolService` infrastructure.

**Tasks:**
1.  Create `ai/mcp/server/app-worker/services/toolService.mjs` (following the pattern in `knowledge-base`).
2.  Map OpenAPI operations (`bridgeReady`, `bridgeEvaluate`) to `BridgeService` methods.
3.  Refactor `ai/mcp/server/app-worker/Server.mjs` to delegate tool handling to `toolService.listTools` and `toolService.callTool`.
4.  Ensure `BridgeService` methods return data in a format compatible with the generic handler.

## Activity Log

- 2025-12-03 @tobiu added the `enhancement` label
- 2025-12-03 @tobiu added the `ai` label
- 2025-12-03 @tobiu added the `refactoring` label
- 2025-12-03 @tobiu added parent issue #7960

