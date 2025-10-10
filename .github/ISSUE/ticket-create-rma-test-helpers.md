# Ticket: Create RMA Helper Scripts for Component Tests

GH ticket id: #7438

**Assignee:**
**Status:** To Do

**Parent Epic:** epic-migrate-component-tests-to-playwright.md

## Description

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

To facilitate communication between the Playwright test runner and the component instances in the app worker, a set of RMA (Remote Method Access) helper scripts is required. These scripts will be injected into the browser context using `page.addInitScript()`.

## Acceptance Criteria

1.  Create a new file, e.g., `test/playwright/util/rma-helpers.mjs`.
2.  This file should export the following asynchronous functions:
    -   `createComponent(config)`: A wrapper around `Neo.worker.App.createNeoInstance()`.
    -   `destroyComponent(id)`: A wrapper around `Neo.worker.App.destroyNeoInstance()`.
    -   `getComponentConfig(id, keyOrKeys)`: A wrapper around `Neo.worker.App.getConfigs()`.
    -   `setComponentConfig(id, config)`: A wrapper around `Neo.worker.App.setConfigs()`.
3.  These helpers will be used in the `beforeEach`, `afterEach`, and test body sections of the component tests.
