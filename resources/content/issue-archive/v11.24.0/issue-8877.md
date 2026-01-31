---
id: 8877
title: Replace Siesta Guide with Playwright Testing Guide
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-25T10:33:24Z'
updatedAt: '2026-01-25T11:19:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8877'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-25T11:19:40Z'
---
# Replace Siesta Guide with Playwright Testing Guide

The goal of this task is to update the testing documentation to reflect the migration from Siesta to Playwright.

**Tasks:**
1.  Remove the obsolete guide `learn/guides/testing/UnitTestingWithSiesta.md`.
2.  Create a new guide `learn/guides/testing/Playwright.md`.
3.  Update `learn/tree.json` to replace the Siesta guide entry with the new Playwright guide.

**New Guide Content:**
-   **Why Playwright?**: Explain the shift (speed, single-thread unit testing, active development, agent-friendly).
-   **Running Tests**: Document the available scripts:
    -   `npm run test`
    -   `npm run test-unit`
    -   `npm run test-components`
-   **Unit Test Structure**: Explain the single-thread environment, `setup.mjs`, and direct imports.
-   **Examples**: Provide code snippets showing `setup()`, `Neo.create()`, and VDOM assertions based on existing tests (e.g., `button/Base.spec.mjs`).
-   **Configuration**: Mention `test/playwright/playwright.config.*.mjs` files.

**Context:**
The migration to Playwright is complete, and the Siesta guide is now misleading. This update ensures the documentation matches the current repository state.

## Timeline

- 2026-01-25T10:33:25Z @tobiu added the `documentation` label
- 2026-01-25T10:33:25Z @tobiu added the `ai` label
- 2026-01-25T11:18:32Z @tobiu referenced in commit `56b5aaa` - "docs: Replace Siesta guide with Playwright testing guide (#8877)"
### @tobiu - 2026-01-25T11:18:42Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the migration of the testing documentation from Siesta to Playwright and finalized the new guide.
> 
> **Changes:**
> 1.  **Deleted:** `learn/guides/testing/UnitTestingWithSiesta.md`
> 2.  **Created:** `learn/guides/testing/Playwright.md`
>     -   **Why Playwright:** Explains the shift to a modern, fast, and agent-friendly framework.
>     -   **Unit Testing Architecture:** Details the unique single-thread Node.js simulation for App/VDom/Data workers.
>     -   **Critical Imports:** Documents the mandatory `core/_export.mjs` augmentation and `VdomHelper`/`DomApiVnodeCreator` requirements.
>     -   **Namespace Isolation:** Explains the `setupClass` guardrails and the requirement for unique class names in the persistent worker environment.
>     -   **Test Lifecycle:** Provides patterns for `test.beforeEach` and `test.afterEach` to prevent memory leaks and ID collisions.
>     -   **Common Patterns:** Includes examples for testing Logic/State, Async/Lifecycle, Reactivity/Effects, and Complex VDOM Logic.
> 3.  **Updated:** `learn/tree.json` to replace the Siesta entry with the new Playwright guide.
> 
> The new guide is comprehensive and accurately reflects the current state of the **Neo.mjs Application Engine** test suite.

- 2026-01-25T11:19:36Z @tobiu assigned to @tobiu
- 2026-01-25T11:19:40Z @tobiu closed this issue

