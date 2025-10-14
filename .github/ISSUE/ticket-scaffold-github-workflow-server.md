---
title: Scaffold GitHub Workflow MCP Server
labels: enhancement, AI
---

GH ticket id: #7479

**Epic:** #7477
**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers the initial scaffolding of the GitHub Workflow MCP server. This involves creating the basic directory structure and placeholder files required to begin development, mirroring the architecture of the existing Memory Core MCP server.

A meaningful health check has been implemented to verify that the `gh` CLI is installed and authenticated, which is critical for the server's operation.

## Acceptance Criteria

1.  The following directory structure has been created:
    - `ai/mcp/server/github-workflow/`
    - `ai/mcp/server/github-workflow/middleware/`
    - `ai/mcp/server/github-workflow/routes/`
    - `ai/mcp/server/github-workflow/services/`
2.  Core server files have been created:
    - `index.mjs` (entry point)
    - `app.mjs` (Express app setup)
    - `config.mjs` (server configuration)
3.  Middleware handlers have been created:
    - `asyncHandler.mjs`
    - `errorHandler.mjs`
    - `notFoundHandler.mjs`
4.  The `/healthcheck` endpoint is functional:
    - `routes/health.mjs` is created.
    - `services/healthService.mjs` is created and uses `gh auth status` to check for CLI installation and authentication.
5.  Placeholder files for the pull request workflow are in place:
    - `routes/pullRequests.mjs`
