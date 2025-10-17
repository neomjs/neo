---
title: "Remove Legacy Express Server from Memory Core"
labels: cleanup, AI
---

Parent epic: #7520
GH ticket id: #7511

**Phase:** 3
**Assignee:** tobiu
**Status:** To Do

## Description

With the new `stdio`-based MCP server fully functional, the final step is to remove the legacy Express.js implementation to complete the migration.

## Acceptance Criteria

1.  The `index.mjs` file (the Express server entry point) is deleted from `ai/mcp/server/memory-core/`.
2.  Any direct Express.js dependencies (`express`, `cors`, etc.) are removed from the main `package.json` if they are no longer needed by other parts of the project.
3.  The `start` script for the memory server in `package.json` is updated or removed.
