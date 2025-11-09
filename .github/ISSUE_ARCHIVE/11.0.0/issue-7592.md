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
closedAt: '2025-10-21T11:31:40Z'
---
# Migrate Label & Issue Services to GraphQL

**Reported by:** @tobiu on 2025-10-21

---

**Parent Issue:** #7590 - Epic: Migrate GitHub MCP Services from GH CLI to GraphQL API

---

As part of the GraphQL migration, the `LabelService` and `IssueService` will be updated to use the new `GraphqlService` instead of making `gh` CLI calls.

## Acceptance Criteria

1.  `LabelService.listLabels` is refactored to use a GraphQL query to fetch the list of repository labels.
2.  `IssueService.addLabels` is refactored to use the `addLabelsToLabelable` GraphQL mutation.
3.  `IssueService.removeLabels` is refactored to use the `removeLabelsFromLabelable` GraphQL mutation.
4.  The old `gh` command logic is removed from these services.

