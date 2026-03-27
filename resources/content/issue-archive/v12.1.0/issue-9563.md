---
id: 9563
title: Modularize MCP Server Architecture and Extract Shared Services
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-26T15:04:35Z'
updatedAt: '2026-03-26T15:11:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9563'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-26T15:11:13Z'
---
# Modularize MCP Server Architecture and Extract Shared Services

### Goal
Refactor the MCP server root files (`Server.mjs`) to reduce bloat by extracting optional and complex logic into dedicated services.

### Context
With the recent addition of OIDC/OAuth 2.1 discovery, token verification, and CORS support, the `Server.mjs` files for Knowledge Base and Memory Core have become less readable. Since this logic is identical across servers, it should be extracted into shared services.

### Proposed Changes
1.  **Extract Auth Logic:** Create `ai/mcp/server/shared/services/AuthService.mjs` to handle OIDC discovery, token verification, and Protected Resource Metadata.
2.  **Extract SSE Logic:** Create `ai/mcp/server/shared/services/TransportService.mjs` to manage Express apps, CORS, SSE transport handshakes, and session management.
3.  **Modular Server:** Update `Server.mjs` to use dynamic imports for these services, keeping the root file lean and ensuring dependencies are only loaded when needed.
4.  **Consolidate Common Logic:** Ensure that future MCP servers can leverage these same services for rapid and consistent deployment.

This refactoring will improve maintainability and simplify the implementation of future features like the Neural Link authorization.

## Timeline

- 2026-03-26T15:04:36Z @tobiu added the `enhancement` label
- 2026-03-26T15:04:36Z @tobiu added the `ai` label
- 2026-03-26T15:04:36Z @tobiu added the `refactoring` label
- 2026-03-26T15:04:36Z @tobiu added the `architecture` label
- 2026-03-26T15:11:02Z @tobiu referenced in commit `8b4254a` - "Modularize MCP server architecture and extract shared services (#9563)"
- 2026-03-26T15:11:09Z @tobiu assigned to @tobiu
- 2026-03-26T15:11:13Z @tobiu closed this issue
### @tobiu - 2026-03-26T15:11:25Z

Refactored Server.mjs by extracting OIDC/OAuth and SSE transport logic into shared AuthService and TransportService. Improved maintainability and reduced root file bloat. Verified with functional tests.

- 2026-03-26T15:15:01Z @tobiu referenced in commit `cd957a3` - "Apply Anchor & Echo strategy to MCP services and tests (#9563)"

