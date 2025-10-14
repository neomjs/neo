---
title: Get PR Conversation History
labels: enhancement, AI
---

GH ticket id: #7384

**Epic:** #7477
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

For an agent to effectively review and comment on a pull request, it needs the full context of the conversation. This includes the PR's title, description (body), and all previous comments.

This ticket covers implementing a new endpoint to retrieve this complete conversation history for a given pull request.

## Acceptance Criteria

1.  The `openapi.yaml` is updated with a new `GET /pull-requests/{pr_number}/conversation` endpoint.
2.  A new `getConversation` function is added to `pullRequestService.mjs`.
3.  The service function uses the `gh pr view <PR_NUMBER> --json title,body,comments` command to fetch the data.
4.  The `routes/pullRequests.mjs` file is updated with the new route and handler.
