# Ticket: Refactor Playwright Setup Function for Test-Specific Configurations

GH ticket id: #7256

**Assignee:** Gemini
**Status:** Done

## Description
Refactored the Playwright `setup.mjs` file to export a configurable function, allowing individual test files to define their specific Neo.mjs global environment. This enables flexible test-specific configurations without conflicts in Playwright's parallel execution model.

## Changes
- Modified `test/playwright/setup.mjs` to export a `setup` function that accepts an `options` object for `neoConfig` and `appConfig`.
- Updated `test/playwright/classic/button.spec.mjs` to import and call the `setup` function with its specific configuration, including `appName`.
