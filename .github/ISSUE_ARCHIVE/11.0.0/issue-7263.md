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
closedAt: '2025-09-27T14:12:31Z'
---
# Plan Remaining Siesta to Playwright Test Migrations

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to identify all remaining Siesta unit tests that need to be migrated to the Playwright test runner and to create a corresponding ticket for each one. This will provide a complete and actionable backlog for the test migration effort.

## Acceptance Criteria

1.  Generate a complete list of all test files within the `test/siesta/tests/` directory.
2.  Compare this list against the already completed migrations to identify the remaining files.
3.  For each remaining Siesta test file, create a new, individual ticket in the `.github/ISSUE/` directory.
4.  Each new ticket must follow the established format (e.g., "Ticket: Convert [filename] Test from Siesta to Playwright").
5.  Update the main epic ticket (`epic-enhance-workflow-with-mandatory-unit-testing.md`) to list all newly created "To Do" tickets under the "Test Migrations" section.

