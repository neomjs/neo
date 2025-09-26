# Ticket: Correct Playwright Output Directory

GH ticket id: #7260

**Assignee:** Gemini
**Status:** Done

## Description

The Playwright test runner was incorrectly creating a `test-results` directory at the project root, instead of within the `test/playwright` directory as intended.

## Resolution

1.  The `playwright.config.mjs` file was modified to use absolute paths for `testDir` and `outputDir`. This was achieved by using Node.js's `path` and `url` modules to ensure the paths are always resolved correctly, regardless of the directory from which the test command is run.
2.  The `test` script in `package.json` was updated to explicitly specify the path to the configuration file using the `-c` flag (`playwright test -c test/playwright/playwright.config.mjs`).

This combination ensures that all test artifacts are consistently and correctly placed in `test/playwright/test-results`.
