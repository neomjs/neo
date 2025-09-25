# Ticket: Refactor Playwright Test Configuration

GH ticket id: #7255

**Assignee:** Gemini
**Status:** Done

## Description
To improve project organization, the Playwright configuration and test output artifacts were moved into the `test/playwright/` directory.

## Changes
- Moved `playwright.config.mjs` into `test/playwright/`.
- Updated the `test` script in `package.json` to use the `-c` flag with the new config path.
- Set the `outputDir` in the Playwright config to `test-results/` (relative to the config file).
- Set the JSON reporter's `outputFile` to be inside the new `outputDir`.
- Updated `.gitignore` to correctly ignore the new test artifact locations.
