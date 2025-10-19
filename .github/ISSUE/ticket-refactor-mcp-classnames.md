---
title: "Refactor MCP Service ClassNames to Use Full Server Names"
labels: enhancement, AI
---

GH ticket id: #7562

**Epic:** #7536
**Phase:** 3
**Assignee:** tobiu
**Status:** Done

## Description

The current `className` definitions for services within the MCP servers use inconsistent or abbreviated names for the server part of the namespace (e.g., `github` instead of `github-workflow`).

To improve clarity, consistency, and discoverability, all service class names should be updated to use the full, correct server directory name as part of their namespace.

## Acceptance Criteria

1.  **GitHub Workflow Server:**
    -   All services in `ai/mcp/server/github-workflow/services/` should have their `className` updated from `Neo.ai.mcp.server.github.*` to `Neo.ai.mcp.server.github-workflow.*`.

2.  **Knowledge Base Server:**
    -   All services in `ai/mcp/server/knowledge-base/services/` should have their `className` updated from `Neo.ai.mcp.server.knowledgebase.*` to `Neo.ai.mcp.server.knowledge-base.*`.

3.  **Memory Core Server:**
    -   All services in `ai/mcp/server/memory-core/services/` should have their `className` updated from `AI.mcp.server.memory.*` to `Neo.ai.mcp.server.memory-core.*`.

*(Note: This is a straightforward find-and-replace task that can be applied across the respective server directories.)*
