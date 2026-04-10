---
id: 9837
title: 'MCP Server: Support nested array schemas in OpenApiValidator'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-09T20:33:24Z'
updatedAt: '2026-04-09T20:33:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9837'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# MCP Server: Support nested array schemas in OpenApiValidator

The `OpenApiValidator.mjs` within the MCP Server infrastructure currently forces all arrays defined in `openapi.yaml` to be mapped to `z.array(z.string())`.

While this handles simple arrays, it causes a `ZodError` for tools that require an array of objects (e.g., `simulateEvent`, which expects an array of event objects like `{ type: "click", targetId: "test" }`).

We need to enhance `buildZodSchema` to introspect the `items` property of the array schema and properly map nested structures like objects to `z.object()` instead of defaulting all arrays to strings. This will support more robust complex payloads passed over the bridge via MCP tools.

## Timeline

- 2026-04-09T20:33:25Z @tobiu added the `enhancement` label
- 2026-04-09T20:33:25Z @tobiu added the `ai` label
- 2026-04-09T20:47:38Z @tobiu cross-referenced by #9838

