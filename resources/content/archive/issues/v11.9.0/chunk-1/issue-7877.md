---
id: 7877
title: Update MCP guides code blocks to be readonly
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T11:49:00Z'
updatedAt: '2025-11-23T11:53:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7877'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T11:53:46Z'
---
# Update MCP guides code blocks to be readonly

The new MCP guides created in `learn/guides/mcp/` currently use standard code blocks (e.g., ```javascript). 
To ensure they are correctly rendered as static, read-only blocks within the Neo.mjs Portal application's learning section, they need to be updated to use the `readonly` modifier.

**Files to Update:**
- `learn/guides/mcp/CodeExecution.md`
- `learn/guides/mcp/GitHubWorkflow.md`
- `learn/guides/mcp/Introduction.md`
- `learn/guides/mcp/KnowledgeBase.md`
- `learn/guides/mcp/MemoryCore.md`

**Task:**
- Update all code block fences to include the `readonly` tag where appropriate (e.g., change ```javascript to ```javascript readonly).


## Timeline

- 2025-11-23T11:49:18Z @tobiu assigned to @tobiu
- 2025-11-23T11:49:26Z @tobiu added the `documentation` label
- 2025-11-23T11:49:27Z @tobiu added the `enhancement` label
- 2025-11-23T11:49:27Z @tobiu added the `ai` label
- 2025-11-23T11:53:35Z @tobiu referenced in commit `1cef3d2` - "Update MCP guides code blocks to be readonly #7877"
- 2025-11-23T11:53:46Z @tobiu closed this issue

