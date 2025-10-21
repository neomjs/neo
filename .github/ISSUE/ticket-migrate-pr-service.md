---
title: "Migrate PullRequestService to GraphQL"
labels: enhancement, AI
---

GH ticket id: #7593

**Epic:** #7590
**Assignee:** tobiu
**Status:** To Do

## Description

This ticket covers the migration of the `PullRequestService` to use the new `GraphqlService` for all its remote data operations.

## Acceptance Criteria

1.  `PullRequestService.listPullRequests` is refactored to use a GraphQL query.
2.  `PullRequestService.createComment` is refactored to use the `addComment` GraphQL mutation.
3.  `PullRequestService.getConversation` is refactored to use a GraphQL query.
4.  `PullRequestService.getPullRequestDiff` is investigated and refactored to use a GraphQL query or an alternative API-based method if possible.
5.  It is confirmed that `PullRequestService.checkoutPullRequest` remains unchanged, as it performs a local Git operation.
