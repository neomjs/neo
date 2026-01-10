---
id: 7592
title: Migrate Label & Issue Services to GraphQL
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-21T11:06:08Z'
updatedAt: '2025-10-21T11:31:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7592'
author: tobiu
commentsCount: 0
parentIssue: 7590
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-21T11:31:40Z'
---
# Migrate Label & Issue Services to GraphQL

As part of the GraphQL migration, the `LabelService` and `IssueService` will be updated to use the new `GraphqlService` instead of making `gh` CLI calls.

## Acceptance Criteria

1.  `LabelService.listLabels` is refactored to use a GraphQL query to fetch the list of repository labels.
2.  `IssueService.addLabels` is refactored to use the `addLabelsToLabelable` GraphQL mutation.
3.  `IssueService.removeLabels` is refactored to use the `removeLabelsFromLabelable` GraphQL mutation.
4.  The old `gh` command logic is removed from these services.

## Timeline

- 2025-10-21 @tobiu assigned to @tobiu
- 2025-10-21 @tobiu added parent issue #7590
- 2025-10-21 @tobiu added the `enhancement` label
- 2025-10-21 @tobiu added the `ai` label
- 2025-10-21 @tobiu referenced in commit `de02d37` - "Migrate Label & Issue Services to GraphQL #7592"
- 2025-10-21 @tobiu closed this issue
- 2025-10-22 @tobiu cross-referenced by #7590

