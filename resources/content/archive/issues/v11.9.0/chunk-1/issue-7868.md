---
id: 7868
title: Implement consistent error handling for Memory Core MCP tools
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-22T21:12:14Z'
updatedAt: '2025-11-22T21:20:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7868'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-22T21:20:22Z'
---
# Implement consistent error handling for Memory Core MCP tools

The following tools in `ai/mcp/server/memory-core/services/toolService.mjs` lack top-level `try-catch` blocks to ensure a consistent error shape for the MCP server:

**Services to Update:**
1.  **`MemoryService.mjs`**: `addMemory`, `listMemories`, `queryMemories`
2.  **`SummaryService.mjs`**: `deleteAllSummaries`, `listSummaries`, `querySummaries`
3.  **`DatabaseService.mjs`**: `exportDatabase`, `importDatabase`
4.  **`DatabaseLifecycleService.mjs`**: `startDatabase`, `stopDatabase`

**Required Error Shape:**
```javascript
{
    error  : 'Description of the error',
    message: error.message,
    code   : 'ERROR_CODE' // e.g., MEMORY_ADD_ERROR, DATABASE_EXPORT_ERROR
}
```

**Note:** `SessionService.summarizeSessions` already implements this pattern. `HealthService.healthcheck` handles errors internally to return a health status, but should be reviewed to ensure it doesn't throw raw exceptions.

**Task:**
Wrap the logic of the listed methods in `try-catch` blocks and return the standardized error object on failure.

## Timeline

- 2025-11-22T21:12:15Z @tobiu added the `enhancement` label
- 2025-11-22T21:12:16Z @tobiu added the `ai` label
- 2025-11-22T21:19:32Z @tobiu assigned to @tobiu
- 2025-11-22T21:19:50Z @tobiu referenced in commit `944c5be` - "Implement consistent error handling for Memory Core MCP tools #7868"
- 2025-11-22T21:20:22Z @tobiu closed this issue

