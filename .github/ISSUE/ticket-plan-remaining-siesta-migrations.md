# Ticket: Plan Remaining Siesta to Playwright Test Migrations

GH ticket id: #7263

**Assignee:**
**Status:** To Do

**Parent Epic:** epic-enhance-workflow-with-mandatory-unit-testing.md

## Description

This task is to identify all remaining Siesta unit tests that need to be migrated to the Playwright test runner and to create a corresponding ticket for each one. This will provide a complete and actionable backlog for the test migration effort.

## Acceptance Criteria

1.  Generate a complete list of all test files within the `test/siesta/tests/` directory.
2.  Compare this list against the already completed migrations to identify the remaining files.
3.  For each remaining Siesta test file, create a new, individual ticket in the `.github/ISSUE/` directory.
4.  Each new ticket must follow the established format (e.g., "Ticket: Convert [filename] Test from Siesta to Playwright").
5.  Update the main epic ticket (`epic-enhance-workflow-with-mandatory-unit-testing.md`) to list all newly created "To Do" tickets under the "Test Migrations" section.
