---
id: 7435
title: Create Component Tests in Playwright (and migrate existing tests from Siesta)
state: OPEN
labels:
  - help wanted
  - epic
  - hacktoberfest
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T16:38:20Z'
updatedAt: '2025-10-27T13:59:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7435'
author: tobiu
commentsCount: 7
parentIssue: null
subIssues:
  - '[x] 7436 Create Component Test Harness Config'
  - '[x] 7437 Create Empty Viewport App for Component Tests'
  - '[x] 7438 Create RMA Helper Scripts for Component Tests'
  - '[x] 7439 Convert Component Test button/Base.mjs to Playwright'
  - '[x] 7440 Convert Component Test component/Base.mjs to Playwright'
  - '[x] 7441 Convert Component Test component/DateSelector.mjs to Playwright'
  - '[x] 7442 Convert Component Test form/field/ComboBox.mjs to Playwright'
  - '[x] 7443 Convert Component Test form/field/Text.mjs to Playwright'
  - '[x] 7444 Create Component Test form/field/Number.mjs in Playwright'
  - '[x] 7445 Add `loadModule` RMA Method to App Worker'
  - '[x] 7469 Refactor: Consolidate and Refine Playwright Test Harness'
  - '[x] 7470 PoC: Create Component Test for component.Image'
  - '[x] 7471 Refactor: Implement Granular Playwright Test Configurations'
  - '[ ] 7677 Create Playwright Component Test for Neo.form.field.Password'
  - '[x] 7703 Convert Component Test list/Chip.mjs to Playwright'
  - '[ ] 7737 Create Playwright Component Test for Neo.component.Label'
subIssuesCompleted: 14
subIssuesTotal: 16
blockedBy: []
blocking: []
---
# Create Component Tests in Playwright (and migrate existing tests from Siesta)

## 1. AI-Native Workflow

This epic and its sub-tasks are designed to be executed using our new **AI-Native Workflow**. We strongly encourage contributors to leverage AI agents (like Gemini) to analyze components and generate new Playwright tests based on the guide below. For some components, existing Siesta tests can be used as a reference, but for most, the tests will be created from scratch by analyzing the component's source code and examples. This is a great opportunity to learn and participate in a cutting-edge development process.

For getting up to speed, please read:
-   [**Working with Agents**](https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md)
-   [**AI Quick Start**](https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md)

Contributors are also encouraged to **create new sub-task tickets** if they identify smaller, logical steps within a larger migration. This helps break down the work and makes it easier for everyone to contribute.

Since the epic subs are strongly built on and related to each other, we also strongly recommend joining the Slack and / or Discord Channels:

https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA
https://discord.gg/6p8paPq

## 2. Scope & Goal (Research & Development)

This epic outlines the plan to create a comprehensive suite of component tests using the Node.js-based Playwright runner. While this includes migrating the few existing Siesta tests, the primary goal is to create new tests for all other components.

This is an **R&D (Research & Development)** effort. The first contributors are not just creating tests; they are pioneers helping to establish a new, modern component testing paradigm for the Neo.mjs project. The goal is to create a robust, isolated, and maintainable testing strategy that can be used for all future component development.

## 3. CRITICAL: The Test Creation Guide & Architecture

All contributors (human or AI) assigned to a component test creation task **MUST** follow these instructions precisely.

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
1.  Create a dedicated test application within the `test/playwright/component/apps/` directory (e.g., `test/playwright/component/apps/calendar-test-app/app.mjs`).
2.  This app will contain the complex component setup.
3.  The Playwright test will navigate to this app's URL and interact with the pre-rendered components.

This approach should be used sparingly as it reduces test isolation.

### 3.5. The "Hybrid" Strategy for Complex Components

For complex, "app-like" components (e.g., `Neo.calendar.view.MainContainer`), a hybrid approach combining the two strategies above is most effective:

1.  **High-Level Integration Test ("Full App"):**
    -   Create a dedicated test harness in `test/playwright/component/apps/` that renders a basic configuration of the complex component.
    -   Write a Playwright test that navigates to this app and performs high-level "smoke tests" (e.g., "does it render?", "do the main buttons work?"). This ensures the component's parts are integrated correctly.

2.  **Granular Unit Tests ("Empty Viewport"):**
    -   Create separate Playwright tests for the complex *sub-components* (e.g., `Neo.calendar.view.week.Component`).
    -   These tests will use the standard "Empty Viewport" strategy, dynamically creating only the sub-component they need.
    -   This allows for focused, isolated testing of the detailed logic within each part of the larger component.

This hybrid strategy provides the best of both worlds: a top-level integration test for confidence and a suite of focused unit tests for precision.

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

## 5. Debugging and Visualization Tips

While the "Empty Viewport" architecture is great for isolation, it can feel like a "black box" during development. Here are some incredibly useful tips for "seeing" what your Playwright tests are doing.

### Seeing the Browser (Headed Mode)

By default, Playwright runs tests in a "headless" browser. To watch the test run in a real browser window, which is invaluable for debugging, use the `--headed` flag:

```bash
npx playwright test --headed
```

### Recording Videos

Playwright can record a video of the test run. To enable video for all tests, you can temporarily modify `test/playwright/playwright.config.component.mjs`:

```javascript
// ...
use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    video: 'on' // Add this line
},
// ...
```

- `'on'`: Records a video for every test run.
- `'retain-on-failure'`: Only keeps the video if the test fails.

### Step-by-step Debugging (Trace Viewer)

The current configuration (`trace: 'on-first-retry'`) automatically creates a detailed trace file if a test fails. This is the most powerful debugging tool.

To view a trace, run the following command and open the generated URL:

```bash
npx playwright show-trace [path-to-the-generated-trace.zip]
```

The trace viewer provides a timeline with screenshots, DOM snapshots, actions, and console logs for every step of your test.

## 6. Reference Material

-   **Advanced Patterns:** For complex scenarios, the `benchmarks` repository contains excellent examples of advanced testing patterns. [Reference Link](https://github.com/neomjs/benchmarks)

## 7. Sub-Tasks

### Phase 1: Build the Test Harness (Done)

- **Done:** ticket-add-loadmodule-rma-method.md
- **Done:** ticket-create-component-test-harness-config.md
- **Done:** ticket-create-empty-viewport-app.md
- **Done:** ticket-create-rma-test-helpers.md
- **Done:** ticket-migrate-first-component-test-button-base.md
- **Done:** ticket-refactor-playwright-test-harness.md
- **Done:** ticket-poc-create-image-component-test.md
- **Done:** ticket-refactor-playwright-configs.md

### Phase 2a: Component Test Migrations

- **To Do:** ticket-migrate-cmp-test-component-base.md
- **To Do:** ticket-migrate-cmp-test-component-dateselector.md
- **To Do:** ticket-migrate-cmp-test-form-field-combobox.md
- **To Do:** ticket-migrate-cmp-test-form-field-text.md
- **To Do:** ticket-migrate-cmp-test-list-chip.md

### Phase 2b: New Component Test Creation

This section is for all new component tests created using the "Cookbook Epic".

- **To Do:**

## Timeline

- 2025-10-10T16:38:20Z @tobiu assigned to @tobiu
- 2025-10-10T16:38:21Z @tobiu added the `help wanted` label
- 2025-10-10T16:38:22Z @tobiu added the `good first issue` label
- 2025-10-10T16:38:22Z @tobiu added the `epic` label
- 2025-10-10T16:38:22Z @tobiu added the `hacktoberfest` label
- 2025-10-10T16:38:22Z @tobiu added the `ai` label
- 2025-10-10T16:39:52Z @tobiu removed the `good first issue` label
- 2025-10-10T16:45:38Z @tobiu cross-referenced by #7436
- 2025-10-10T16:45:39Z @tobiu added sub-issue #7436
- 2025-10-10T16:47:12Z @tobiu added sub-issue #7437
- 2025-10-10T16:47:12Z @tobiu cross-referenced by #7437
- 2025-10-10T16:48:56Z @tobiu cross-referenced by #7438
- 2025-10-10T16:48:57Z @tobiu added sub-issue #7438
- 2025-10-10T16:50:39Z @tobiu added sub-issue #7439
- 2025-10-10T16:50:39Z @tobiu cross-referenced by #7439
- 2025-10-10T16:51:59Z @tobiu added sub-issue #7440
- 2025-10-10T16:51:59Z @tobiu cross-referenced by #7440
- 2025-10-10T16:53:30Z @tobiu added sub-issue #7441
- 2025-10-10T16:53:30Z @tobiu cross-referenced by #7441
- 2025-10-10T16:54:52Z @tobiu added sub-issue #7442
- 2025-10-10T16:54:52Z @tobiu cross-referenced by #7442
- 2025-10-10T16:56:19Z @tobiu added sub-issue #7443
- 2025-10-10T16:56:19Z @tobiu cross-referenced by #7443
- 2025-10-10T16:58:40Z @tobiu added sub-issue #7444
- 2025-10-10T16:58:40Z @tobiu cross-referenced by #7444
- 2025-10-10T17:02:39Z @tobiu referenced in commit `48d43fc` - "#7435 ticket md files"
- 2025-10-10T17:19:05Z @tobiu added sub-issue #7445
- 2025-10-10T17:27:23Z @tobiu referenced in commit `25acc3f` - "#7435 internal ticket md updates"
### @tobiu - 2025-10-10T17:47:07Z

Input from Gemini:

> > well, there were only very little component based tests inside siesta, so the epic outline to migrate all siesta based tests is not wrong. but as you can see, there could be 100s of additional "write from scratch" tests. the same applies for unit testing. imagine to test a buffered grid: this would require an in-depth analysis what this widget can do (e.g. different selection models, component based columns etc.). testing apps like the neo website (portal app) is also important, but this is an epic i would really skip until we have several working component tests.
> 
> ✦ You're right. I was getting ahead of myself with the "full coverage" idea and the automated script. My proposal was too
>   ambitious and skipped several necessary steps. The real problem isn't just migrating existing tests, but also tackling the
>   massive amount of untested components.
> 
>   Let's recalibrate based on your more pragmatic view.
> 
>   Revised Understanding:
> 
>    1. The "Migrate" Epic is Correct, but Small: The epic we created, epic-migrate-component-tests-to-playwright, is accurately scoped. Its goal is to migrate the few existing Siesta component tests. Completing this is a valuable and necessary first step.
>    2. The Real Challenge is "New" Tests: The vast majority of components have no tests at all. Creating tests for these from
>       scratch is a much larger and more complex task than migration.
>    3. Complexity Varies Wildly: As you pointed out with the buffered grid example, testing a simple component like
>       Neo.button.Base is trivial compared to testing a complex container like Neo.grid.Container with its myriad configurations,
>       plugins, and selection models. A one-size-fits-all "create test" ticket is not feasible.
>    4. E2E Testing is a Distant Goal: Testing full applications like the portal app is End-to-End (E2E) testing, which is a
>       completely different discipline. We must solve unit and component testing first.
> 
>   A Better, More Realistic Strategy:
> 
>   Instead of a massive, automated "full coverage" epic, let's adopt an incremental, more thoughtful approach.
> 
>    1. Finish the R&D Epic: We stick to the current plan. We wait to see if a contributor tackles Phase 1 of
>       epic-migrate-component-tests-to-playwright. If not, we do it ourselves. This proves the harness and the pattern.
> 
>    2. Create a "Component Test Coverage" Tracking Epic: We can still create a new epic, but its purpose will be different. It
>       won't be a list of hundreds of auto-generated tickets. Instead, it will be a high-level tracking and planning document.
>        * It can list the major component namespaces (e.g., button, form, grid, list, table, tab).
>        * For each namespace, we can have a status: Not Started, In Progress, Covered.
>        * This epic will be our strategic tool to decide which area to focus on next.
> 
>    3. Tackle New Coverage in "Sprints": Once the harness is ready, we can approach new test creation in small, focused
>       "sprints" or batches. For example:
>        * Sprint 1: The Button Library. We create a handful of tickets to write tests for Neo.button.Base, Neo.button.Split,
>          etc. These are relatively simple and a good way to build momentum.
>        * Sprint 2: The Form Fields. We then move to the form fields, which are more complex.
>        * Sprint 3: The Grid (A Deep Dive). We would create a dedicated sub-epic just for Neo.grid.Container, breaking down the work into tickets for "basic rendering," "selection models," "cell editing," etc. This acknowledges the complexity you mentioned.
> 
>   This approach is more agile and allows us to prioritize effectively. We can start with the low-hanging fruit to build
>   confidence and then dedicate focused effort to the complex areas like the grid. It also allows us to write much
>   higher-quality, more specific tickets for new tests, as each one will require some initial analysis.
> 
>   Does this more incremental, sprint-based approach to achieving test coverage seem like a better fit?

### @Aki-07 - 2025-10-11T04:57:51Z

Hey @tobiu I have started my work on this Epic, could you assign me to this? Have raised a PR for the test harness config file

### @Aki-07 - 2025-10-11T05:22:38Z

Thanks @tobiu Since you broke the tasks in smaller checkpoints and very clear, was straighrforward to create PRs
Please do review them in your free time
Thanks!

### @tobiu - 2025-10-11T16:15:40Z

Some thoughts on my end: I would recommend to assign you sub-tickets, since assigning an epic means to be responsible for the planning phase, further refinements and adding more subs as needed.

The current state of the epic is literally just the tip of the iceberg. To get the full picture, you need to use `npm run build-all`, and afterwards take a look into: `docs/output/class-hierarchy.yaml`. We are talking about 500+ entries in there. Even if we ignore all not component based items, and (demo) app related widgets, we are talking of 100+ additional subs that need to get refined.

Some widgets are like apps on their own, think about the calendar or a buffered grid. So we will need a second strategy, which creates apps with widgets trees inside the app worker.

TL-BR: I think it would make sense if I take care of the epic itself and assign subs, however if you really want to manage the entire epic, it would be fine for me, and I can provide more context. This one will be a huge amount of work. Your call!


### @Aki-07 - 2025-10-11T18:12:31Z

Makes sense, I loved working in each sub part, And will continue to request myself for each sub task

- 2025-10-12T12:56:06Z @tobiu added sub-issue #7469
- 2025-10-12T12:57:30Z @tobiu added sub-issue #7470
- 2025-10-12T14:06:29Z @tobiu added sub-issue #7471
- 2025-10-12T14:27:31Z @tobiu referenced in commit `84ee05c` - "#7435 component.Image: specs location update"
### @tobiu - 2025-10-12T14:28:21Z

FYI: phase 1 is completed now.

### @tobiu - 2025-10-13T21:06:18Z

updated the epic body with more hints, created a separate new epic just for defining "what to test exactly" for each cmp. hacktoberfest quick wins: https://github.com/neomjs/neo/issues/7475

into the new epic, we can now drop big amounts of subs.

- 2025-10-14T07:44:37Z @tobiu cross-referenced by #7476
- 2025-10-27T13:59:12Z @tobiu changed title from **Migrate Component Tests from Siesta to Playwright (R&D)** to **Create Component Tests in Playwright (and migrate existing tests from Siesta)**
- 2025-10-27T14:00:20Z @tobiu added sub-issue #7677
- 2025-11-04T18:48:03Z @tobiu added sub-issue #7703
- 2025-11-10T20:25:51Z @tobiu added sub-issue #7737

