---
id: 8015
title: Remove deprecated App Worker MCP Server
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-03T22:14:16Z'
updatedAt: '2025-12-03T22:15:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8015'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-03T22:15:22Z'
---
# Remove deprecated App Worker MCP Server

The `ai/mcp/server/app-worker` implementation has been fully superseded by the new `ai/mcp/server/neural-link` architecture.

The `app-worker` directory has been deleted locally. This ticket tracks the commitment of this deletion to the repository to remove dead code and technical debt.

## Activity Log

- 2025-12-03 @tobiu added the `ai` label
- 2025-12-03 @tobiu added the `refactoring` label
- 2025-12-03 @tobiu added the `dropped` label
- 2025-12-03 @tobiu removed the `dropped` label
- 2025-12-03 @tobiu assigned to @tobiu
- 2025-12-03 @tobiu referenced in commit `7d4d11c` - "Remove deprecated App Worker MCP Server #8015"
- 2025-12-03 @tobiu closed this issue

