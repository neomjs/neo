---
id: 7610
title: Refactor `LocalFileService` to Remove `glob` Dependency
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-22T13:13:05Z'
updatedAt: '2025-10-22T13:13:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7610'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-22T13:13:44Z'
---
# Refactor `LocalFileService` to Remove `glob` Dependency

The `LocalFileService` currently uses the `glob` npm package for recursively searching the `ISSUE_ARCHIVE` directory. To minimize external dependencies and maintain a leaner codebase, this dependency should be removed. The recursive file search functionality can be reimplemented using Node.js's native `fs/promises` module.

## Acceptance Criteria

1.  The `glob` import is removed from `ai/mcp/server/github-workflow/services/LocalFileService.mjs`.
2.  A new private helper method, e.g., `#findFileRecursively(directory, filename)`, is implemented within `LocalFileService.mjs`.
3.  This helper method performs a recursive search for the specified `filename` within the given `directory` and its subdirectories, returning the absolute path of the first match, or `null` if not found.

## Timeline

- 2025-10-22T13:13:05Z @tobiu assigned to @tobiu
- 2025-10-22T13:13:06Z @tobiu added the `ai` label
- 2025-10-22T13:13:07Z @tobiu added the `refactoring` label
- 2025-10-22T13:13:32Z @tobiu referenced in commit `03f7174` - "Refactor LocalFileService to Remove glob Dependency #7610"
- 2025-10-22T13:13:44Z @tobiu closed this issue

