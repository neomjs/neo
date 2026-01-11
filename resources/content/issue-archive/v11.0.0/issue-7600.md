---
id: 7600
title: Update OpenAPI Specification to Reflect GraphQL Data Models
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-22T09:17:01Z'
updatedAt: '2025-10-22T09:32:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7600'
author: tobiu
commentsCount: 0
parentIssue: 7590
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-22T09:32:53Z'
---
# Update OpenAPI Specification to Reflect GraphQL Data Models

Following the migration of our GitHub services from the `gh` CLI to a direct GraphQL implementation, the data models returned by our services have become significantly richer. For example, the `SyncService` now provides detailed issue relationship data (parent, sub-issues) that is not reflected in the current `openapi.yaml` specification.

An outdated API specification is misleading for both human developers and AI agents attempting to use the tools. This ticket is to perform a thorough review of the current service responses and update the OpenAPI schemas to match the new, richer data structures.

## Acceptance Criteria

1.  Analyze the response schema of the `sync_issues` operation (`SyncIssuesResponse`) and update it to include the new parent/sub-issue fields and any other new data points returned by the `SyncService`.
2.  Analyze the response schema of the `get_conversation` operation (`PullRequestConversation`) and ensure it accurately reflects the data returned by the `PullRequestService`.
3.  Review all other relevant schemas in `openapi.yaml` (e.g., `PullRequest`, `Label`) to ensure they are aligned with the data now being returned by the GraphQL-backed services.
4.  Ensure all examples in the OpenAPI specification are updated to reflect the new data structures.

## Timeline

- 2025-10-22T09:17:02Z @tobiu assigned to @tobiu
- 2025-10-22T09:17:03Z @tobiu added the `documentation` label
- 2025-10-22T09:17:03Z @tobiu added the `enhancement` label
- 2025-10-22T09:17:03Z @tobiu added the `ai` label
- 2025-10-22T09:17:03Z @tobiu added parent issue #7590
- 2025-10-22T09:32:34Z @tobiu referenced in commit `ae5fb36` - "Update OpenAPI Specification to Reflect GraphQL Data Models #7600"
- 2025-10-22T09:32:53Z @tobiu closed this issue

