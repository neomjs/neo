---
id: 7471
title: 'Refactor: Implement Granular Playwright Test Configurations'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-12T14:06:28Z'
updatedAt: '2025-10-12T14:10:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7471'
author: tobiu
commentsCount: 1
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-12T14:10:54Z'
---
# Refactor: Implement Granular Playwright Test Configurations

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

## Timeline

- 2025-10-12T14:06:28Z @tobiu assigned to @tobiu
- 2025-10-12T14:06:29Z @tobiu added the `enhancement` label
- 2025-10-12T14:06:29Z @tobiu added parent issue #7435
- 2025-10-12T14:06:30Z @tobiu added the `ai` label
- 2025-10-12T14:07:28Z @tobiu referenced in commit `bd3b69a` - "Refactor: Implement Granular Playwright Test Configurations #7471"
### @tobiu - 2025-10-12T14:10:54Z

FYI @Aki-07 , @Mahita07 I think we are getting close with making the epic more accessible to others. These infrastructure items are rough, even with ai support. I had to push back on Gemini very hard, several times.

I will grab the button test next for a real migration and check how it works.

- 2025-10-12T14:10:54Z @tobiu closed this issue

