# Ticket: Create Component Test Harness Config

GH ticket id: #7436

**Assignee:** Aki-07
**Status:** Done

**Parent Epic:** epic-migrate-component-tests-to-playwright.md

## Description

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

This is the first foundational task for the component testing R&D effort. The goal is to create a dedicated Playwright configuration file specifically for running component tests.

## Acceptance Criteria

1.  Create a new file at `test/playwright/playwright.config.component.mjs`.
2.  The configuration must enforce serial execution by setting `fullyParallel: false` and `workers: 1`.
3.  It must configure the `webServer` to use the `npm run server-start` command.
4.  The `testDir` should be set to `./component`.
5.  Refer to the parent epic for a complete example configuration.
