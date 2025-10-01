# Ticket: Convert config/MemoryLeak.mjs Test from Siesta to Playwright

GH ticket id: #7278

**Assignee:** Gemini
**Status:** Done

**Parent Epic:** epic-enhance-workflow-with-mandatory-unit-testing.md

## Description

This task is to migrate the unit test for `config/MemoryLeak.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/config/MemoryLeak.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/config/MemoryLeak.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.
