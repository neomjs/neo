---
title: 'Refactor: Implement Granular Playwright Test Configurations'
labels: enhancement, AI
---

GH ticket id: #7471

**Epic:** Migrate Component Tests from Siesta to Playwright (R&D)
**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

This task covers the architectural refactoring of the Playwright test setup to support multiple, independent test suites. The previous configuration was monolithic and would have led to conflicts between unit and component tests.

**The following changes were implemented to create a robust and scalable testing structure:**

1.  **Granular Config Files:**
    *   `test/playwright/playwright.config.unit.mjs` was created to exclusively run headless unit tests.
    *   `test/playwright/playwright.config.component.mjs` was created to exclusively run browser-based component tests, which require a web server.
    *   The root `test/playwright/playwright.config.mjs` was updated to serve as a master config that runs *all* test suites.

2.  **Dedicated NPM Scripts:**
    *   The following scripts were added to `package.json` to provide clear entry points for developers and CI:
        *   `npm run test-unit`: Runs only unit tests.
        *   `npm run test-components`: Runs only component tests.
        *   `npm test`: Runs the full suite.

3.  **Isolated Output Directories:**
    *   Each configuration now writes its results to a dedicated output directory to prevent conflicts:
        *   Unit tests: `test/playwright/test-results/unit/`
        *   Component tests: `test/playwright/test-results/component/`
        *   Full suite: `test/playwright/test-results/all/`

This new structure provides a clear, conflict-free, and easy-to-use system for all Playwright-based testing.
