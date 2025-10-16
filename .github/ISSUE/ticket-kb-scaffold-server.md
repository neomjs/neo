---
title: Scaffold Knowledge Base MCP Server
labels: enhancement, AI
---


Parent epic: #7501
GH ticket id: #7503

**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers the initial scaffolding of the new AI Knowledge Base MCP server. The goal is to create the basic file structure and entry point for the server, consistent with the pattern established by the `github-workflow` MCP server.

## Acceptance Criteria

1.  The core server directory `ai/mcp/server/knowledge-base/` is created.
2.  An `mcp-stdio.mjs` entry point file is created inside the directory, containing the boilerplate for an MCP server.
3.  A `services/` subdirectory is created.
4.  A `toolService.mjs` file is created within `services/`, containing placeholder `listTools` and `callTool` functions.
5.  An entry for the server is added to `.gemini/settings.json` to register it with the CLI.
