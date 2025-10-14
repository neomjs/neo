---
title: Define Initial OpenAPI Specification for GitHub Workflow Server
labels: enhancement, AI
---

GH ticket id: #7478

**Epic:** #7477
**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers the creation of the initial `openapi.yaml` specification for the new GitHub Workflow MCP server.

The goal is to define a clear, structured API for the server's first iteration, focusing on the core functionalities needed to unblock the pull request review process.

## Acceptance Criteria

1.  An `openapi.yaml` file is created within the `ai/mcp/server/github-workflow` directory.
2.  The specification includes the following endpoints:
    - A `GET /healthcheck` endpoint to verify server status and `gh` CLI accessibility.
    - A `GET /pull-requests` endpoint to list open PRs.
    - A `POST /pull-requests/{pr_number}/checkout` endpoint.
    - A `GET /pull-requests/{pr_number}/diff` endpoint.
3.  The specification defines clear request and response schemas for each endpoint.
4.  The initial draft is committed and pushed, allowing for further review and implementation.
