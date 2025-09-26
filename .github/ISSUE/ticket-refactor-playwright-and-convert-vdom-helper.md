# Ticket: Refactor Playwright Setup and Convert VdomHelper Test

GH ticket id: #7258

**Assignee:** Gemini
**Status:** In Progress

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

The conversion of the `VdomHelper` test has uncovered a bug in the `VdomHelper` when `useDomApiRenderer` is `false`. The `className` property is being incorrectly moved into the `attributes` object of the vnode.

This bug is documented in ticket: **.github/ISSUE/ticket-vdom-helper-classname-bug.md**

The tests in `VdomHelper.spec.mjs` are currently failing as expected, pending a fix for the bug.

## Next Steps:

- Do not merge any fixes that make the broken tests pass.
- The priority is to fix the underlying bug in the framework.
