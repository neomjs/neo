# Ticket: Convert Component Test button/Base.mjs to Playwright

GH ticket id: #7439

**Assignee:** tobiu
**Status:** Done

**Parent Epic:** epic-migrate-component-tests-to-playwright.md

## Description

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

This task is to migrate the component test for `button/Base.mjs` from the Siesta test harness to the Playwright test runner. As the final step in Phase 1, this task will serve as the proof-of-concept that validates the new test harness.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/button/Base.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test must cover all the functionality of the original Siesta test (`test/components/files/button/Base.mjs`).
4.  Ensure the new test runs successfully using the new component test harness.
