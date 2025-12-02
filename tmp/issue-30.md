---
id: 30
title: Add postinstall script to scaffolded package.json
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-12-02T13:11:56Z'
updatedAt: '2025-12-02T13:15:00Z'
githubUrl: 'https://github.com/neomjs/create-app/issues/30'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T13:15:00Z'
---
# Add postinstall script to scaffolded package.json

Update `tasks/createPackageJson.mjs` to include a `postinstall` script in the generated `package.json`.

**Reasoning:**
The AI MCP servers (defined in `ai:mcp-server-*` scripts) rely on the `neo.mjs` package being fully installed. A `postinstall` script ensures that `npm install` on the generated workspace correctly sets up the `neo.mjs` dependency, guaranteeing the servers are executable.

## Activity Log

- 2025-12-02 @tobiu added the `enhancement` label
- 2025-12-02 @tobiu assigned to @tobiu
- 2025-12-02 @tobiu referenced in commit `170e73b` - "Add postinstall script to scaffolded package.json #30"
- 2025-12-02 @tobiu closed this issue

