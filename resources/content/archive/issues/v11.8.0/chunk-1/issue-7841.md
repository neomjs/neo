---
id: 7841
title: Fix list_issues tool schema validation error
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-21T13:02:43Z'
updatedAt: '2025-11-21T13:35:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7841'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-21T13:35:47Z'
---
# Fix list_issues tool schema validation error

The `list_issues` tool fails with a schema validation error because the `IssueService.listIssues` method returns raw GraphQL response structures for `labels` and `assignees` (nested under `nodes`), whereas the OpenAPI schema expects flat arrays.

**Error:**
`data/issues/0/labels must be array`
`data/issues/0/assignees must be array`

**Fix:**
Transform the GraphQL response in `IssueService.listIssues` to map `labels.nodes` to `labels` and `assignees.nodes` to `assignees` before returning the data.

## Timeline

- 2025-11-21T13:02:44Z @tobiu added the `bug` label
- 2025-11-21T13:02:45Z @tobiu added the `ai` label
- 2025-11-21T13:03:05Z @tobiu assigned to @tobiu
### @tobiu - 2025-11-21T13:34:19Z

**Input from Gemini:**

> ✦ Fixed the `list_issues` schema validation error by:
> 1.  Creating a new, optimized GraphQL query `FETCH_ISSUES_LIST` in `issueQueries.mjs` that fetches only the required fields.
> 2.  Updating `IssueService.mjs` to use this new query.
> 3.  Implementing in-place transformation in `IssueService.listIssues` to flatten `labels` and `assignees` from GraphQL nodes to simple arrays, strictly matching the OpenAPI schema.
> 
> The tool now returns correctly formatted data.

- 2025-11-21T13:35:40Z @tobiu referenced in commit `ade50ef` - "Fix list_issues tool schema validation error #7841"
- 2025-11-21T13:35:47Z @tobiu closed this issue

