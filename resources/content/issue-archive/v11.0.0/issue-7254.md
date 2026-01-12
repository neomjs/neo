---
id: 7254
title: Install Playwright and Convert First Siesta Test
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-25T21:16:18Z'
updatedAt: '2025-09-25T21:26:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7254'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-25T21:26:01Z'
---
# Install Playwright and Convert First Siesta Test

Install the Playwright test runner and convert an initial Siesta unit test to the new framework to establish a baseline pattern for future test migration.

### Implementation Notes
The initial approach was to convert the VDOM unit test into a browser-based component integration test. However, the goal was refined to keep it as a pure VDOM unit test running within a Node.js environment.

The final, successful implementation uses Playwright's test runner without a browser. It works by:
1.  Creating a `setup.mjs` file to mock the necessary browser globals (`DOMRect`) and configure the `Neo` namespace on `globalThis` for a headless environment.
2.  Configuring `playwright.config.mjs` to run without a browser or web server.
3.  Writing the test spec as a pure Node.js module, importing the framework classes directly and asserting against the VDOM data structures returned by the component's methods.

This pattern allows for fast, browser-less unit testing of framework components using the Playwright test runner.

## Tasks
- [x] Install `@playwright/test` dependency.
- [x] Create `playwright.config.mjs` for a Node.js test environment.
- [x] Create `test/playwright/setup.mjs` to configure the Node.js global scope.
- [x] Convert `test/siesta/tests/classic/Button.mjs` to `test/playwright/classic/button.spec.mjs`.
- [x] All tests are passing.
- [x] Move `playwright.config.mjs` into `test/playwright/` and update paths.

## Timeline

- 2025-09-25T21:16:18Z @tobiu assigned to @tobiu
- 2025-09-25T21:16:19Z @tobiu added the `enhancement` label
- 2025-09-25T21:18:25Z @tobiu referenced in commit `af081ad` - "Install Playwright and Convert First Siesta Test #7254"
- 2025-09-25T21:26:01Z @tobiu closed this issue
- 2025-09-27T11:18:21Z @tobiu added parent issue #7262

