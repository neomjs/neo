# Ticket: Migrate Siesta test for vdom/table/Container.mjs to Playwright

**Assignee:** Gemini
**Status:** To Do

## Description
Migrate the Siesta test for `vdom/table/Container.mjs` from the Siesta test harness to the Playwright test runner.

## Requirements
- Create a new test file at `test/playwright/unit/vdom/table/Container.spec.mjs`.
- Translate all assertions from the original file at `test/siesta/tests/vdom/table/Container.mjs` to Playwright/Jest `expect` syntax.
- Ensure the new test runs successfully via `npm test`.
- The new test must cover all the functionality of the original Siesta test.
