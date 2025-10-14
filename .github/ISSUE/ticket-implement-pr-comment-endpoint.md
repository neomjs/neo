---
title: Implement PR Commenting Endpoint
labels: enhancement, AI
---

GH ticket id: #7383

**Epic:** #7477
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

To enable the agent to participate in code reviews, it needs the ability to post comments on pull requests. This ticket covers the implementation of a new endpoint on the GitHub Workflow MCP server for this purpose.

The endpoint will allow the agent to submit a comment for a specific pull request.

## Acceptance Criteria

1.  The `openapi.yaml` is updated with a new `POST /pull-requests/{pr_number}/comments` endpoint.
2.  The endpoint accepts a JSON body containing the `comment` text.
3.  A new `createComment` function is added to `pullRequestService.mjs`.
4.  The service function uses the `gh pr comment` command to post the comment to the specified pull request.
5.  The `routes/pullRequests.mjs` file is updated with the new route and handler.
