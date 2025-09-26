# Ticket: Refactor Playwright Setup and Convert VdomHelper Test

GH ticket id: #7258

**Assignee:** Gemini
**Status:** Done

## Description

This ticket covers the initial refactoring of the Playwright test environment and the conversion of the `VdomHelper` unit test from Siesta.

### Work Completed:

1.  **Folder Structure Refactored:**
    - Created `test/playwright/unit` and `test/playwright/integration` directories.
    - Moved the initial `button.spec.mjs` to the `unit` directory.
    - Updated `playwright.config.mjs` to point to the new `unit` directory.

2.  **VdomHelper Test Converted:**
    - Converted `test/siesta/tests/VdomHelper.mjs` to `test/playwright/unit/VdomHelper.spec.mjs`.
    - Refactored the test setup (`test/playwright/setup.mjs`) to ensure the Neo environment is initialized correctly.

### Current Status:

The conversion of the `VdomHelper` test is complete. After a thorough review, all missing test logic from the original Siesta test has been added to `test/playwright/unit/VdomHelper.spec.mjs`.

All 14 unit tests in the Playwright suite are now passing.
