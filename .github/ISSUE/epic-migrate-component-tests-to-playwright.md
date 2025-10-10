# Epic: Migrate Component Tests from Siesta to Playwright (R&D)

GH ticket id: #7435

**Assignee:** tobiu
**Status:** To Do

## 1. AI-Native Workflow

This epic and its sub-tasks are designed to be executed using our new **AI-Native Workflow**. We strongly encourage contributors to leverage AI agents (like Gemini) to analyze the old Siesta tests and generate the new Playwright versions based on the guide below. This is a great opportunity to learn and participate in a cutting-edge development process.

For getting up to speed, please read:
-   [**Working with Agents**](https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md)
-   [**AI Quick Start**](https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md)

Contributors are also encouraged to **create new sub-task tickets** if they identify smaller, logical steps within a larger migration. This helps break down the work and makes it easier for everyone to contribute.

Since the epic subs are strongly built on and related to each other, we also strongly recommend joining the Slack and / or Discord Channels:

https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA
https://discord.gg/6p8paPq

## 2. Scope & Goal (Research & Development)

This epic outlines the plan to migrate the entire suite of component tests from the browser-based Siesta harness to the Node.js-based Playwright runner. 

This is an **R&D (Research & Development)** effort. The first contributors are not just migrating tests; they are pioneers helping to establish a new, modern component testing paradigm for the Neo.mjs project. The goal is to create a robust, isolated, and maintainable testing strategy that can be used for all future component development.

## 3. CRITICAL: The Migration Guide & Architecture

All contributors (human or AI) assigned to a component test migration **MUST** follow these instructions precisely.

### 3.1. Core Concepts: The Worker Boundary

-   **Components Live in the App Worker:** In a Neo.mjs app, all components and their logic exist within the App Worker.
-   **Playwright Lives in the Main Thread:** The Playwright test runner executes in the main thread and can only directly interact with the DOM.
-   **Communication via RMA:** All communication to verify or change the *internal state* of a component must happen asynchronously through **Remote Method Access (RMA)**.

### 3.2. The "Empty Viewport" Architecture (Default Strategy)

To ensure speed and perfect test isolation, we will use the **"Empty Viewport"** strategy. Instead of loading a large, pre-built application, each test will start with a minimal app shell and dynamically create only the component it needs for that specific test case. This is the required approach for all standard component tests.

### 3.3. The Component Test Pattern

Each test file must follow this structure:

**A. `beforeEach` Hook (Component Creation):**
-   Use `page.evaluate()` to call a helper function that uses `Neo.worker.App.createNeoInstance()` to create the component under test.
-   Store the returned component `id` for later use.
    ```javascript
    let componentId;

    test.beforeEach(async ({ page }) => {
        // 1. Load the component's module into the app worker
        await page.evaluate(() => loadModule('../../src/button/Base.mjs'));

        // 2. Create an instance of the component
        componentId = await page.evaluate(() => createComponent({
            ntype: 'button', text: 'Click Me'
        }));
    });
    ```

**B. Test Body (Interaction & Assertion):**
-   **Verifying the DOM:** Use standard Playwright locators and web-first assertions (`expect(locator).toHaveClass()`). Playwright's auto-waiting is sufficient for most cases.
    ```javascript
    const button = page.locator(`#${componentId}`);
    await button.click();
    await expect(button).toHaveClass(/neo-pressed/);
    ```
-   **Verifying Internal State:** To check a config value not reflected in the DOM, use RMA via `page.evaluate()`.
    ```javascript
    const text = await page.evaluate(id => getComponentConfig(id, 'text'), componentId);
    expect(text).toBe('New Text');
    ```

**C. `afterEach` Hook (Component Destruction):**
-   Use `page.evaluate()` to call a helper that uses `Neo.worker.App.destroyNeoInstance()` with the stored `id`.
    ```javascript
    test.afterEach(async ({ page }) => {
        if (componentId) {
            await page.evaluate(id => destroyComponent(id), componentId);
        }
    });
    ```

### 3.4. The "Full App" Architecture (Advanced Strategy)

For highly complex integration tests where creating components dynamically is not feasible, a secondary strategy can be employed:
1.  Create a dedicated test application within the `test/` directory (e.g., `test/apps/component-tests/app.mjs`).
2.  This app will contain the complex component setup.
3.  The Playwright test will navigate to this app's URL and interact with the pre-rendered components.

This approach should be used sparingly as it reduces test isolation.

## 4. Playwright Configuration

To enable component testing, we will need a dedicated Playwright configuration.

### 4.1. Create Separate Config Files

We will use two separate configurations to keep concerns separate:
-   `test/playwright/playwright.config.unit.mjs` (for existing unit tests)
-   `test/playwright/playwright.config.component.mjs` (for new component tests)

A root `playwright.config.mjs` can be created to orchestrate running both suites if needed, but the initial focus should be on creating the dedicated component config.

### 4.2. Component Test Configuration

The `playwright.config.component.mjs` must enforce serial execution.

-   Set `fullyParallel: false` at the top level.
-   Set `workers: 1` at the top level.
-   Configure the `webServer` to use the standard `server-start` script.

### Example `playwright.config.component.mjs`:

```javascript
// test/playwright/playwright.config.component.mjs
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './component',
  fullyParallel: false, // CRITICAL
  workers: 1,           // CRITICAL

  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'npm run server-start',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

## 5. Reference Material

-   **Advanced Patterns:** For complex scenarios, the `benchmarks` repository contains excellent examples of advanced testing patterns. [Reference Link](https://github.com/neomjs/benchmarks)

## 6. Sub-Tasks

### Phase 1: Build the Test Harness

- **Done:** ticket-add-loadmodule-rma-method.md
- **To Do:** ticket-create-component-test-harness-config.md
- **To Do:** ticket-create-empty-viewport-app.md
- **To Do:** ticket-create-rma-test-helpers.md
- **To Do:** ticket-migrate-first-component-test-button-base.md

### Phase 2: Component Test Migrations

**This phase is blocked by the completion of Phase 1.**

- **To Do:** ticket-migrate-cmp-test-component-base.md
- **To Do:** ticket-migrate-cmp-test-component-dateselector.md
- **To Do:** ticket-migrate-cmp-test-form-field-combobox.md
- **To Do:** ticket-migrate-cmp-test-form-field-text.md
- **To Do:** ticket-migrate-cmp-test-list-chip.md

