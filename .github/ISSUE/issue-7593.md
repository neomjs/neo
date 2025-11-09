---
id: 7593
title: Migrate PullRequestService to GraphQL
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-21T11:07:09Z'
updatedAt: '2025-10-21T11:39:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7593'
author: tobiu
commentsCount: 1
parentIssue: 7590
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-21T11:39:14Z'
---
# Migrate PullRequestService to GraphQL

**Reported by:** @tobiu on 2025-10-21

---

**Parent Issue:** #7590 - Epic: Migrate GitHub MCP Services from GH CLI to GraphQL API

---

This ticket covers the migration of the `PullRequestService` to use the new `GraphqlService` for all its remote data operations.

## Acceptance Criteria

1.  `PullRequestService.listPullRequests` is refactored to use a GraphQL query.
2.  `PullRequestService.createComment` is refactored to use the `addComment` GraphQL mutation.
3.  `PullRequestService.getConversation` is refactored to use a GraphQL query.
4.  `PullRequestService.getPullRequestDiff` is investigated and refactored to use a GraphQL query or an alternative API-based method if possible.
5.  It is confirmed that `PullRequestService.checkoutPullRequest` remains unchanged, as it performs a local Git operation.

## Comments

### @tobiu - 2025-10-21 11:39

> ✦ Finally, I'll address getPullRequestDiff. The gh pr diff command is convenient because it connects to the remote and generates a standard diff output. Replicating this with GraphQL would involve fetching the base and head commit SHAs for the PR, then potentially using another API or local git commands to generate the diff between them. This is significantly more complex than the other migrations.
> 
>   Given that complexity, and to keep moving forward, I will leave the getPullRequestDiff method using the gh CLI for now. This is a pragmatic trade-off. The other core data-retrieval methods have been migrated, which was the main goal.

