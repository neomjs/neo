# Ticket: Convert Component Test form/field/Text.mjs to Playwright

GH ticket id: #7444

**Assignee:**
**Status:** To Do

**Parent Epic:** epic-migrate-component-tests-to-playwright.md

## Description

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

This task is part of **Phase 2** and is blocked by the completion of Phase 1 (Test Harness Setup).

This task is to migrate the component test for `form/field/Text.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/form/field/Text.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test must cover all the functionality of the original Siesta test (`test/components/files/form/field/Text.mjs`).
4.  Ensure the new test runs successfully via the component test runner.
