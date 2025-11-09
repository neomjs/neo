---
id: 7540
title: Convert dbService to DatabaseService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T12:03:28Z'
updatedAt: '2025-10-18T12:17:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7540'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-18T12:17:22Z'
---
# Convert dbService to DatabaseService Neo.mjs Class

**Reported by:** @tobiu on 2025-10-18

---

**Parent Issue:** #7536 - Epic: Integrate Neo.mjs Core into MCP Servers

---

This ticket covers refactoring `ai/mcp/server/memory-core/services/dbService.mjs` into a singleton class that extends `Neo.core.Base`. The file will also be renamed to `DatabaseService.mjs` to follow a more consistent naming convention. This service handles the export and import of memory core data.

## Acceptance Criteria

1.  The file `ai/mcp/server/memory-core/services/dbService.mjs` is renamed to `ai/mcp/server/memory-core/services/DatabaseService.mjs`.
2.  The `dbService.mjs` module is refactored into a `DatabaseService` class.
3.  The `DatabaseService` class extends `Neo.core.Base` and is configured as a singleton.
4.  Existing functions (`exportCollection`, `exportDatabase`, `importDatabase`) are converted into class methods.
5.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `DatabaseService` singleton and map its methods.
6.  Any other services that depend on `dbService` are updated to use the new `DatabaseService` singleton instance.
7.  All related tools (e.g., `export_database`, `import_database`) continue to function correctly after the refactoring.

