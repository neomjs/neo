---
title: Refine Health Check for GitHub Workflow Server
labels: enhancement, AI
---

GH ticket id: #7380

**Epic:** #7477
**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

The initial health check for the GitHub Workflow MCP server was a simple placeholder. This ticket covers the work to make it more robust and meaningful by incorporating the more detailed verification logic from the existing `buildScripts/ai/verifyGhSetup.mjs` script.

The new health check now verifies three critical conditions:
1.  That the `gh` CLI is installed.
2.  That the CLI is authenticated.
3.  That the CLI version meets a minimum requirement.

This ensures that the server only reports as "healthy" if it is fully capable of performing its duties.

## Acceptance Criteria

1.  The `ai/mcp/server/github-workflow/services/healthService.mjs` file is updated.
2.  The `buildHealthResponse` function now performs separate checks for `gh` installation, authentication, and version.
3.  The JSON response from the `/healthcheck` endpoint now includes a more detailed `githubCli` object with separate booleans for `installed`, `authenticated`, and `versionOk`.
4.  The overall health status is set to `unhealthy` if any of the checks fail, with a descriptive error message included in the response.
