---
id: 7258
title: Refactor Playwright Setup and Convert VdomHelper Test
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-26T13:10:56Z'
updatedAt: '2025-09-26T13:43:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7258'
author: tobiu
commentsCount: 1
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-26T13:43:00Z'
---
# Refactor Playwright Setup and Convert VdomHelper Test

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

## Timeline

- 2025-09-26T13:10:56Z @tobiu assigned to @tobiu
- 2025-09-26T13:10:57Z @tobiu added the `enhancement` label
- 2025-09-26T13:12:35Z @tobiu referenced in commit `6b0aa06` - "Refactor Playwright Setup and Convert VdomHelper Test #7258"
- 2025-09-26T13:12:42Z @tobiu closed this issue
### @tobiu - 2025-09-26T13:42:29Z

reopening, since some tests were not migrated properly.

- 2025-09-26T13:42:29Z @tobiu reopened this issue
- 2025-09-26T13:42:51Z @tobiu referenced in commit `e527632` - "Refactor Playwright Setup and Convert VdomHelper Test #7258"
- 2025-09-26T13:43:01Z @tobiu closed this issue
- 2025-09-27T11:17:18Z @tobiu added parent issue #7262

