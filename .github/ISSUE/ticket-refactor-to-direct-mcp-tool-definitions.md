---
title: Refactor to Direct MCP Tool Definitions
labels: enhancement, AI
---

GH ticket id: #7492

**Epic:** #7378
**Phase:** 3
**Assignee:** tobiu
**Status:** To Do

## Description

As per the official Model Context Protocol (MCP) specification, tools are defined with a specific JSON Schema-based structure (`name`, `description`, `inputSchema`, etc.).

Our current implementation uses an `openapi.yaml` file as a source of truth, which is then parsed by `toolService.mjs` to generate the MCP-compliant tool definitions. This is an unnecessary layer of abstraction.

This ticket covers the refactoring of the GitHub Workflow MCP server to define tools directly in code, aligning with the MCP specification and simplifying the architecture.

## Acceptance Criteria

1.  The `openapi.yaml` file is deleted.
2.  A new module is created (e.g., `ai/mcp/server/github-workflow/tools.mjs`) that exports an array of tool definitions, strictly following the MCP `Tool` schema.
3.  `toolService.mjs` is refactored to import the tool definitions directly from the new module instead of parsing the OpenAPI spec.
4.  All Express-related files (`index.mjs`, `app.mjs`, `config.mjs`, and the `routes` and `middleware` directories) are deleted.
5.  The `ai:server-github-workflow-mcp` script in `package.json` is verified to work correctly with the refactored server.
