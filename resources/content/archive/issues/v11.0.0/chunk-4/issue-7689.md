---
id: 7689
title: 'Bug: Memory Core `querySummaries` fails when category is undefined'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-02T16:14:08Z'
updatedAt: '2025-11-02T16:15:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7689'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-02T16:15:28Z'
---
# Bug: Memory Core `querySummaries` fails when category is undefined

The `querySummaries` method in `SummaryService.mjs` constructs a ChromaDB query. When the `category` parameter is `undefined`, the `where` clause of the query is set to `where: undefined`.

The ChromaDB client does not handle this gracefully and throws an error: `Expected 'where' value to be a string, number, boolean, or an operator expression, but got undefined`.

The fix is to conditionally build the query parameters, only adding the `where` key if a `category` is provided.

## Timeline

- 2025-11-02T16:14:10Z @tobiu added the `bug` label
- 2025-11-02T16:14:10Z @tobiu added the `ai` label
- 2025-11-02T16:14:42Z @tobiu assigned to @tobiu
- 2025-11-02T16:15:05Z @tobiu referenced in commit `59c3dba` - "Bug: Memory Core querySummaries fails when category is undefined #7689"
- 2025-11-02T16:15:28Z @tobiu closed this issue

