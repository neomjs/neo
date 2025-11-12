---
id: 7758
title: Extract inline GraphQL queries from `IssueService.mjs` to `queries` folder
state: OPEN
labels:
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-12T14:18:39Z'
updatedAt: '2025-11-12T14:18:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7758'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Extract inline GraphQL queries from `IssueService.mjs` to `queries` folder

**Reported by:** @tobiu on 2025-11-12

The `IssueService.mjs` file currently contains inline GraphQL query definitions within the `#handleBlockedByRelationship` method. To maintain a clean separation of concerns and adhere to existing conventions, these inline queries should be extracted into dedicated query files within the `ai/mcp/server/github-workflow/services/queries` folder.

