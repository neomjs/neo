---
id: 7255
title: Refactor Playwright Test Configuration
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-25T21:26:37Z'
updatedAt: '2025-09-25T21:27:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7255'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-25T21:27:28Z'
---
# Refactor Playwright Test Configuration

**Reported by:** @tobiu on 2025-09-25

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

To improve project organization, the Playwright configuration and test output artifacts were moved into the `test/playwright/` directory.

## Changes
- Moved `playwright.config.mjs` into `test/playwright/`.
- Updated the `test` script in `package.json` to use the `-c` flag with the new config path.
- Set the `outputDir` in the Playwright config to `test-results/` (relative to the config file).
- Set the JSON reporter's `outputFile` to be inside the new `outputDir`.
- Updated `.gitignore` to correctly ignore the new test artifact locations.

