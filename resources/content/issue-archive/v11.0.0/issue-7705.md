---
id: 7705
title: Remove Siesta from the project
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - testing
assignees:
  - tobiu
createdAt: '2025-11-04T20:22:13Z'
updatedAt: '2025-11-04T20:29:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7705'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-04T20:29:04Z'
---
# Remove Siesta from the project

With the successful migration of all unit and component tests to Playwright, the Siesta framework is now obsolete. This ticket is to track the work of completely removing all Siesta-related files and dependencies from the repository. This includes updating `package.json`, deleting the `test/siesta/` and `test/components/` directories, and cleaning up any related scripts or documentation.

## Timeline

- 2025-11-04T20:22:14Z @tobiu added the `enhancement` label
- 2025-11-04T20:22:14Z @tobiu added the `ai` label
- 2025-11-04T20:22:14Z @tobiu added the `refactoring` label
- 2025-11-04T20:22:15Z @tobiu added the `testing` label
- 2025-11-04T20:22:57Z @tobiu assigned to @tobiu
- 2025-11-04T20:28:49Z @tobiu referenced in commit `0c1d395` - "Remove Siesta from the project #7705"
- 2025-11-04T20:29:04Z @tobiu closed this issue

