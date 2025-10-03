# Ticket: Migrate state/Provider.mjs Siesta Test to Playwright

**Assignee:** Gemini
**Status:** In Progress

## Description

The Siesta test for `state/Provider.mjs` needs to be migrated to the Playwright test runner.

## Requirements:

1.  Create a new test file at `test/playwright/unit/state/Provider.spec.mjs`.
2.  Translate all assertions from the original file at `test/siesta/tests/state/Provider.mjs` to Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.
