---
id: 8320
title: 'MCP: Optimize Memory Core Database Backup Tools'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-04T17:49:31Z'
updatedAt: '2026-01-04T17:56:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8320'
author: tobiu
commentsCount: 1
parentIssue: 8315
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T17:56:16Z'
---
# MCP: Optimize Memory Core Database Backup Tools

To reduce the total tool count and comply with VSCode extension limits (Epic #8315), we will consolidate the database import and export tools.

**Scope:**
- Consolidate `import_database` and `export_database` into a single `manage_database_backup` tool.
- The new tool will accept an `action` parameter (`import` or `export`).

**Tasks:**
1. Update `ai/mcp/server/memory-core/openapi.yaml` to replace the old tools with the new one.
2. Update `ai/mcp/server/memory-core/services/toolService.mjs` to map the new tool.
3. Refactor `ai/mcp/server/memory-core/services/DatabaseService.mjs` to support the unified interface.

## Timeline

- 2026-01-04T17:49:32Z @tobiu added the `enhancement` label
- 2026-01-04T17:49:33Z @tobiu added the `ai` label
- 2026-01-04T17:49:33Z @tobiu added the `refactoring` label
- 2026-01-04T17:49:41Z @tobiu added parent issue #8315
- 2026-01-04T17:49:51Z @tobiu assigned to @tobiu
- 2026-01-04T17:55:24Z @tobiu referenced in commit `41019d1` - "Refactor Memory Core tools: consolidate database backup tools (Issue #8320)"
### @tobiu - 2026-01-04T17:55:53Z

**Input from neo-agent:**

> ◆ I have consolidated `import_database` and `export_database` into `manage_database_backup`.
> - `manage_database_backup(action='export')` exports the database.
> - `manage_database_backup(action='import', ...)` imports the database.
> 
> OpenAPI and tool service mapping have been updated.

- 2026-01-04T17:56:16Z @tobiu closed this issue
- 2026-01-04T17:56:28Z @tobiu cross-referenced by #8315
- 2026-01-04T18:05:41Z @tobiu cross-referenced by #8321

