---
id: 7263
title: Plan Remaining Siesta to Playwright Test Migrations
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-27T11:19:28Z'
updatedAt: '2025-09-27T14:12:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7263'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-27T14:12:31Z'
---
# Plan Remaining Siesta to Playwright Test Migrations

This task is to identify all remaining Siesta unit tests that need to be migrated to the Playwright test runner and to create a corresponding ticket for each one. This will provide a complete and actionable backlog for the test migration effort.

## Acceptance Criteria

1.  Generate a complete list of all test files within the `test/siesta/tests/` directory.
2.  Compare this list against the already completed migrations to identify the remaining files.
3.  For each remaining Siesta test file, create a new, individual ticket in the `.github/ISSUE/` directory.
4.  Each new ticket must follow the established format (e.g., "Ticket: Convert [filename] Test from Siesta to Playwright").
5.  Update the main epic ticket (`epic-enhance-workflow-with-mandatory-unit-testing.md`) to list all newly created "To Do" tickets under the "Test Migrations" section.

## Timeline

- 2025-09-27T11:19:28Z @tobiu assigned to @tobiu
- 2025-09-27T11:19:29Z @tobiu added parent issue #7262
- 2025-09-27T11:19:30Z @tobiu added the `enhancement` label
- 2025-09-27T14:12:22Z @tobiu referenced in commit `89cdd42` - "Plan Remaining Siesta to Playwright Test Migrations #7263"
- 2025-09-27T14:12:31Z @tobiu closed this issue

