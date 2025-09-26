# Ticket: Convert core/Effect.mjs Siesta Test to Playwright

GH ticket id: #7261

**Assignee:** Gemini
**Status:** Done

## Description

As part of the ongoing effort to migrate the testing suite from Siesta to Playwright, the unit test for `core/Effect.mjs` needs to be converted.

This involves translating the existing test at `test/siesta/tests/core/Effect.mjs` into a new Playwright spec file.

## Acceptance Criteria

- Create a new Playwright unit test file at `test/playwright/unit/core/Effect.spec.mjs`.
- Convert all assertions and test logic from the Siesta test to the Playwright/Jest `expect` syntax.
- Ensure the new test is self-contained and passes successfully.
- All other tests in the suite must continue to pass.
