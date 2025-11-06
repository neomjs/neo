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
closedAt: '2025-11-04T20:29:04Z'
---
# Remove Siesta from the project

**Reported by:** @tobiu on 2025-11-04

With the successful migration of all unit and component tests to Playwright, the Siesta framework is now obsolete. This ticket is to track the work of completely removing all Siesta-related files and dependencies from the repository. This includes updating `package.json`, deleting the `test/siesta/` and `test/components/` directories, and cleaning up any related scripts or documentation.

