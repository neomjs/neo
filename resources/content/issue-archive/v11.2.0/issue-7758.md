---
id: 7758
title: Extract inline GraphQL queries from `IssueService.mjs` to `queries` folder
state: CLOSED
labels:
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-12T14:18:39Z'
updatedAt: '2025-11-13T10:28:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7758'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-13T10:28:44Z'
---
# Extract inline GraphQL queries from `IssueService.mjs` to `queries` folder

The `IssueService.mjs` file currently contains inline GraphQL query definitions within the `#handleBlockedByRelationship` method. To maintain a clean separation of concerns and adhere to existing conventions, these inline queries should be extracted into dedicated query files within the `ai/mcp/server/github-workflow/services/queries` folder.

## Timeline

- 2025-11-12T14:18:40Z @tobiu added the `ai` label
- 2025-11-12T14:18:40Z @tobiu added the `refactoring` label
- 2025-11-12T14:22:13Z @tobiu cross-referenced by PR #7753
- 2025-11-13T06:23:17Z @MannXo cross-referenced by PR #7763
- 2025-11-13T10:28:44Z @tobiu closed this issue

