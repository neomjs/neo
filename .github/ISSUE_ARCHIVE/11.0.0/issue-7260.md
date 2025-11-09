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
closedAt: '2025-09-26T14:10:22Z'
---
# Correct Playwright Output Directory

**Reported by:** @tobiu on 2025-09-26

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

The Playwright test runner was incorrectly creating a `test-results` directory at the project root, instead of within the `test/playwright` directory as intended.

## Resolution

1.  The `playwright.config.mjs` file was modified to use absolute paths for `testDir` and `outputDir`. This was achieved by using Node.js's `path` and `url` modules to ensure the paths are always resolved correctly, regardless of the directory from which the test command is run.
2.  The `test` script in `package.json` was updated to explicitly specify the path to the configuration file using the `-c` flag (`playwright test -c test/playwright/playwright.config.mjs`).

This combination ensures that all test artifacts are consistently and correctly placed in `test/playwright/test-results`.

