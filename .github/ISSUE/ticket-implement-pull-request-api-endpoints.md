---
title: Implement Pull Request API Endpoints
labels: enhancement, AI
---

GH ticket id: #7381

**Epic:** #7477
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers the implementation of the core pull request-related endpoints for the GitHub Workflow MCP server. This provides the foundational functionality for the AI agent to begin interacting with pull requests.

The following endpoints have been implemented:

- `GET /pull-requests`
- `POST /pull-requests/:pr_number/checkout`
- `GET /pull-requests/:pr_number/diff`

## Acceptance Criteria

1.  A new `pullRequestService.mjs` is created in the `services` directory.
2.  The service contains functions that wrap the corresponding `gh` CLI commands:
    - `listPullRequests` uses `gh pr list`
    - `checkoutPullRequest` uses `gh pr checkout`
    - `getPullRequestDiff` uses `gh pr diff`
3.  The `routes/pullRequests.mjs` file is updated to call these new service functions.
4.  The endpoints correctly handle requests and return the expected JSON data or plain text diff.
