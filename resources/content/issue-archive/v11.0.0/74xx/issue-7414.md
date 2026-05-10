---
id: 7414
title: Implement GitHub Action to Prevent Issue Reopening
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-07T15:43:02Z'
updatedAt: '2025-10-07T15:45:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7414'
author: tobiu
commentsCount: 0
parentIssue: 7364
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-07T15:45:19Z'
---
# Implement GitHub Action to Prevent Issue Reopening

To enforce the project policy that GitHub issues, once closed, should not be reopened, this ticket is for implementing a GitHub Actions workflow. This workflow will automatically close any reopened issue and create a new one, providing a clear explanation to the user. This streamlines the issue tracking process and prevents confusion.

## Acceptance Criteria

1.  A new GitHub Actions workflow file, `.github/workflows/prevent-reopen.yml`, is created.
2.  The workflow is triggered on `issues` of type `reopened`.
3.  The workflow automatically closes the reopened issue.
4.  The workflow creates a new issue with the original content, clearly indicating it was reopened.
5.  A comment is added to the original issue, explaining the policy and linking to the new issue.

## Timeline

- 2025-10-07T15:43:02Z @tobiu assigned to @tobiu
- 2025-10-07T15:43:04Z @tobiu added the `enhancement` label
- 2025-10-07T15:43:04Z @tobiu added parent issue #7364
- 2025-10-07T15:45:08Z @tobiu referenced in commit `709feec` - "Implement GitHub Action to Prevent Issue Reopening #7414"
- 2025-10-07T15:45:19Z @tobiu closed this issue

