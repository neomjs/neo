---
id: 7260
title: Correct Playwright Output Directory
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-26T14:09:00Z'
updatedAt: '2025-09-26T14:10:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7260'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-26T14:10:22Z'
---
# Correct Playwright Output Directory

The Playwright test runner was incorrectly creating a `test-results` directory at the project root, instead of within the `test/playwright` directory as intended.

## Resolution

1.  The `playwright.config.mjs` file was modified to use absolute paths for `testDir` and `outputDir`. This was achieved by using Node.js's `path` and `url` modules to ensure the paths are always resolved correctly, regardless of the directory from which the test command is run.
2.  The `test` script in `package.json` was updated to explicitly specify the path to the configuration file using the `-c` flag (`playwright test -c test/playwright/playwright.config.mjs`).

This combination ensures that all test artifacts are consistently and correctly placed in `test/playwright/test-results`.

## Timeline

- 2025-09-26T14:09:00Z @tobiu assigned to @tobiu
- 2025-09-26T14:09:01Z @tobiu added the `enhancement` label
- 2025-09-26T14:10:03Z @tobiu referenced in commit `ff35fc5` - "Correct Playwright Output Directory #7260"
- 2025-09-26T14:10:22Z @tobiu closed this issue
- 2025-09-27T11:16:49Z @tobiu added parent issue #7262

