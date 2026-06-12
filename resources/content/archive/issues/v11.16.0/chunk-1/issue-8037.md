---
id: 8037
title: Recreate OpenAPI specification for Neural Link MCP Server
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-05T21:46:35Z'
updatedAt: '2025-12-05T21:47:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8037'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-05T21:47:44Z'
---
# Recreate OpenAPI specification for Neural Link MCP Server

The `neural-link` MCP server was missing its `openapi.yaml` specification file. This task involves recreating the file to match the `ConnectionService` implementation, ensuring consistency with the `memory-core` server architecture.

Scope:
- Analyze `ConnectionService.mjs` to identify exposed methods.
- Create `openapi.yaml` defining tools for `get_component_property`, `get_component_tree`, `reload_page`, and `set_component_property`.
- Ensure standard error responses (400, 500) and component schemas are used.
- Verify integration with `package.json` and `.gemini/settings.json`.

## Timeline

- 2025-12-05T21:46:37Z @tobiu added the `enhancement` label
- 2025-12-05T21:46:37Z @tobiu added the `ai` label
- 2025-12-05T21:46:56Z @tobiu assigned to @tobiu
- 2025-12-05T21:47:29Z @tobiu referenced in commit `7a811cb` - "Recreate OpenAPI specification for Neural Link MCP Server #8037"
- 2025-12-05T21:47:44Z @tobiu closed this issue

