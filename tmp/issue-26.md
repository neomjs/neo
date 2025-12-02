---
id: 26
title: Generate MCP server config files in scaffolded app
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-12-02T12:51:59Z'
updatedAt: '2025-12-02T12:59:52Z'
githubUrl: 'https://github.com/neomjs/create-app/issues/26'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T12:59:52Z'
---
# Generate MCP server config files in scaffolded app

Implement tasks to generate configuration files for the AI MCP servers in the new application.

**Requirements:**
Create the following files with the specified content:

1. `ai/mcp/server/github-workflow/config.json`
   ```json
   {
       "owner": "ADD_GITHUB_ORGANIZATION_HERE",
       "repo" : "ADD_GITHUB_REPOSITORY_HERE"
   }
   ```

2. `ai/mcp/server/memory-core/config.json`
   ```json
   {}
   ```

3. `ai/mcp/server/knowledge-base/config.json`
   ```json
   {}
   ```

Ensure the necessary directory structures are created.

## Activity Log

- 2025-12-02 @tobiu added the `enhancement` label
- 2025-12-02 @tobiu assigned to @tobiu
- 2025-12-02 @tobiu referenced in commit `9b4e494` - "Generate MCP server config files in scaffolded app #26"
- 2025-12-02 @tobiu closed this issue

