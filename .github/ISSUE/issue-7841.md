---
id: 7841
title: Fix list_issues tool schema validation error
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2025-11-21T13:02:43Z'
updatedAt: '2025-11-21T13:02:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7841'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix list_issues tool schema validation error

The `list_issues` tool fails with a schema validation error because the `IssueService.listIssues` method returns raw GraphQL response structures for `labels` and `assignees` (nested under `nodes`), whereas the OpenAPI schema expects flat arrays.

**Error:**
`data/issues/0/labels must be array`
`data/issues/0/assignees must be array`

**Fix:**
Transform the GraphQL response in `IssueService.listIssues` to map `labels.nodes` to `labels` and `assignees.nodes` to `assignees` before returning the data.

## Activity Log

- 2025-11-21 @tobiu added the `bug` label
- 2025-11-21 @tobiu added the `ai` label

