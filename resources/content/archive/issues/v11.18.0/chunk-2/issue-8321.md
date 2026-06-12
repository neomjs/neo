---
id: 8321
title: Fix broken manage_database_backup tool shape in Memory Core OpenAPI
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-04T18:05:40Z'
updatedAt: '2026-01-04T18:12:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8321'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T18:12:57Z'
---
# Fix broken manage_database_backup tool shape in Memory Core OpenAPI

The recent consolidation of backup tools (Issue #8320) introduced a `multipart/form-data` definition and complex response schemas that broke the Memory Core.

**Root Causes:**
1. **Tool Shape Incompatibility:** The `multipart/form-data` content type and `format: binary` for the `file` argument are incompatible with text-based LLM interactions and standard MCP tool definitions.
2. **Schema Validation Failure:** The use of `oneOf` in the `manage_database_backup` response schema caused `zod-to-json-schema` conversion errors (`expected "object"`) during tool discovery, preventing the server from listing tools.
3. **Implementation Mismatch:** The `DatabaseService.mjs` implementation returned inconsistent data structures (e.g., missing `message` in imports, returning `total`) that did not align with the defined OpenAPI schema.

**Solution:**
1. **Simplify Input Schema:** Change `requestBody` to `application/json` and `file` to a string path.
2. **Unified Response Schema:** Replace `oneOf` with a single `BackupActionResponse` schema containing nullable fields (`imported`, `skipped`, `total`, `mode`) and a mandatory `message`.
3. **Standardize Service Output:** Update `DatabaseService.mjs` to return a consistent object structure matching the new schema.

## Timeline

- 2026-01-04T18:05:41Z @tobiu added the `bug` label
- 2026-01-04T18:05:42Z @tobiu added the `ai` label
- 2026-01-04T18:11:12Z @tobiu assigned to @tobiu
- 2026-01-04T18:11:40Z @tobiu referenced in commit `b7539d3` - "fix: standardize manage_database_backup return values and schema (Issue #8321)"
- 2026-01-04T18:12:57Z @tobiu closed this issue

