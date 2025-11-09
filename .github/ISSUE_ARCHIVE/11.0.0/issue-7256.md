---
id: 7256
title: Refactor Playwright Setup Function for Test-Specific Configurations
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-25T22:29:50Z'
updatedAt: '2025-09-25T22:30:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7256'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-25T22:30:44Z'
---
# Refactor Playwright Setup Function for Test-Specific Configurations

**Reported by:** @tobiu on 2025-09-25

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

Refactored the Playwright `setup.mjs` file to export a configurable function, allowing individual test files to define their specific Neo.mjs global environment. This enables flexible test-specific configurations without conflicts in Playwright's parallel execution model.

## Changes
- Modified `test/playwright/setup.mjs` to export a `setup` function that accepts an `options` object for `neoConfig` and `appConfig`.
- Updated `test/playwright/classic/button.spec.mjs` to import and call the `setup` function with its specific configuration, including `appName`.

