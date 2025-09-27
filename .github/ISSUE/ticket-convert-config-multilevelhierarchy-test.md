# Ticket: Convert config/MultiLevelHierarchy.mjs Test from Siesta to Playwright

GH ticket id: #7279

**Assignee:**
**Status:** To Do

**Parent Epic:** epic-enhance-workflow-with-mandatory-unit-testing.md

## Description

This task is to migrate the unit test for `config/MultiLevelHierarchy.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/config/MultiLevelHierarchy.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/config/MultiLevelHierarchy.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.
