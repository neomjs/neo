---
id: 7443
title: Convert Component Test form/field/Text.mjs to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - hacktoberfest
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T16:56:17Z'
updatedAt: '2025-11-04T19:41:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7443'
author: tobiu
commentsCount: 2
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-04T19:41:09Z'
---
# Convert Component Test form/field/Text.mjs to Playwright

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns: https://github.com/neomjs/neo/issues/7435

This task is part of **Phase 2** and is blocked by the completion of Phase 1 (Test Harness Setup).

This task is to migrate the component test for `form/field/Text.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/form/field/Text.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test must cover all the functionality of the original Siesta test (`test/components/files/form/field/Text.mjs`).
4.  Ensure the new test runs successfully via the component test runner.

## Timeline

- 2025-10-10T16:56:19Z @tobiu added parent issue #7435
- 2025-10-10T16:56:19Z @tobiu added the `enhancement` label
- 2025-10-10T16:56:19Z @tobiu added the `help wanted` label
- 2025-10-10T16:56:19Z @tobiu added the `hacktoberfest` label
- 2025-10-10T16:56:19Z @tobiu added the `ai` label
### @harikrishna-au - 2025-10-13T02:06:08Z

@tobiu please assign


- 2025-10-13T09:47:57Z @tobiu assigned to @harikrishna-au
### @tobiu - 2025-10-13T09:55:54Z

assigned. i will further refine the epic with hints on how to work on component based testing (once i am done with ticket assignments and PR reviews), since it is non-trivial. playwright runs by default a headless chromium, so devs and gemini are still flying blind, except when switching to a non-headless browser, or changing the playwright settings to record videos.

some ideas: look into `src/form/field/Text.mjs` to see how it works. Use `npm run build-all`, unless you have already done it for your fork. then use `npm run server-start`, and you can open examples like `examples/form/field/text` inside your browser.

we can literally open 100+ additional tickets for component based testing alone.

- 2025-11-04T19:40:26Z @tobiu unassigned from @harikrishna-au
- 2025-11-04T19:40:26Z @tobiu assigned to @tobiu
- 2025-11-04T19:40:55Z @tobiu referenced in commit `878a3fe` - "Convert Component Test form/field/Text.mjs to Playwright #7443"
- 2025-11-04T19:41:09Z @tobiu closed this issue

