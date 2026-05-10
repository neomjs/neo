---
id: 7469
title: 'Refactor: Consolidate and Refine Playwright Test Harness'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-12T12:56:05Z'
updatedAt: '2025-10-12T12:59:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7469'
author: tobiu
commentsCount: 1
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-12T12:59:36Z'
---
# Refactor: Consolidate and Refine Playwright Test Harness

This task covers the architectural refactoring and consolidation of the Playwright component test harness. After the initial implementation of the "empty viewport" app, we identified several key improvements to create a more logical and scalable structure for our new testing suite.

**Key Changes Implemented:**
1.  **Consolidated Directory Structure:** The test harness application was moved from `test/apps/` to a dedicated, co-located home at `test/playwright/component/apps/empty-viewport/`. This ensures all Playwright-related artifacts reside in a single, intuitive location.
2.  **Architectural Simplification:** The harness was simplified by removing the unnecessary `EmptyViewport.mjs` subclass and using the framework's base `Neo.container.Viewport` directly.
3.  **Configuration Cleanup:** The `neo-config.json` for the harness was cleaned up to remove redundant settings and rely on the framework's defaults from `src/DefaultConfig.mjs`.
4.  **Strategy Documentation:** The main epic (`epic-migrate-component-tests-to-playwright.md`) was updated to reflect these structural changes and to formally document the new **hybrid testing strategy** for complex components.

## Timeline

- 2025-10-12T12:56:05Z @tobiu assigned to @tobiu
- 2025-10-12T12:56:06Z @tobiu added parent issue #7435
- 2025-10-12T12:56:07Z @tobiu added the `enhancement` label
- 2025-10-12T12:56:07Z @tobiu added the `ai` label
- 2025-10-12T12:58:15Z @tobiu referenced in commit `a48b99b` - "Refactor: Consolidate and Refine Playwright Test Harness
#7469"
### @tobiu - 2025-10-12T12:59:36Z

FYI @Aki-07. I will create 1-2 PoC tests next. also updated the epic to at least mention the hybrid strategy.

- 2025-10-12T12:59:36Z @tobiu closed this issue

