---
id: 7498
title: Fix Gemini CLI Client Compatibility for MCP `tools/list` Response
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-15T13:41:05Z'
updatedAt: '2025-10-15T13:42:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7498'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-15T13:42:29Z'
---
# Fix Gemini CLI Client Compatibility for MCP `tools/list` Response

The Gemini CLI client was unable to correctly parse the `tools/list` response from the `neo-github-workflow` MCP server due to strict validation rules and issues with `npm run` output. This ticket addresses these compatibility issues by adjusting the server's response format and startup command.

## Acceptance Criteria

1.  The `command` and `args` for `neo-github-workflow` in `.gemini/settings.json` are updated to directly invoke `node ai/mcp/server/github-workflow/mcp-stdio.mjs`, eliminating extraneous `npm run` output.
2.  `toolService.mjs` is modified to ensure that `outputSchema` is always a valid JSON Schema object, even for primitive types or when no schema is explicitly defined, by wrapping primitive types in an object schema and returning an empty object schema for undefined outputs.
3.  `toolService.mjs` is modified to omit the `nextCursor` field entirely from the `listTools` response when its value is `null`.
4.  `mcp-stdio.mjs` is modified to conditionally include `nextCursor` in the `tools/list` response only if it is not `undefined`.
5.  The Gemini CLI client successfully lists all tools from the `neo-github-workflow` server without errors.

## Timeline

- 2025-10-15T13:41:05Z @tobiu assigned to @tobiu
- 2025-10-15T13:41:06Z @tobiu added parent issue #7477
- 2025-10-15T13:41:07Z @tobiu added the `bug` label
- 2025-10-15T13:41:07Z @tobiu added the `ai` label
- 2025-10-15T13:42:22Z @tobiu referenced in commit `933919f` - "Fix Gemini CLI Client Compatibility for MCP tools/list Response #7498"
- 2025-10-15T13:42:30Z @tobiu closed this issue
- 2025-10-25T17:52:10Z @tobiu cross-referenced by #7652

