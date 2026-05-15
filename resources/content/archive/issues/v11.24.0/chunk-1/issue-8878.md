---
id: 8878
title: 'Restructure Testing Documentation (Phase 1: Component & Unit Guides)'
state: CLOSED
labels:
  - documentation
  - ai
assignees: []
createdAt: '2026-01-26T10:03:23Z'
updatedAt: '2026-01-26T10:17:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8878'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-26T10:17:47Z'
---
# Restructure Testing Documentation (Phase 1: Component & Unit Guides)

Restructure the testing documentation to clearly separate Unit Testing from Component Testing.

**Tasks:**
1.  **Create `learn/guides/testing/ComponentTesting.md`**:
    -   Document the "Real Browser" testing strategy using the `empty-viewport` app.
    -   Explain the `neo` fixture API (`test/playwright/fixtures.mjs`) for creating/manipulating components.
    -   Explain the single-worker constraint.
2.  **Rename & Update `learn/guides/testing/Playwright.md`**:
    -   Rename to `learn/guides/testing/UnitTesting.md`.
    -   Update content to explicitly focus on the Node.js/Single-Thread simulation aspect.
3.  **Update `learn/tree.json`**:
    -   Reflect the new file names and structure.

**Goal:** Provide clear, distinct entry points for the two testing methodologies.

## Timeline

- 2026-01-26T10:03:25Z @tobiu added the `documentation` label
- 2026-01-26T10:03:25Z @tobiu added the `ai` label
- 2026-01-26T10:16:20Z @tobiu referenced in commit `ba4bae1` - "docs: Restructure testing guides (#8878)"
### @tobiu - 2026-01-26T10:16:37Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the first phase of the testing documentation restructuring.
> 
> **Changes:**
> 1.  **Renamed:** `learn/guides/testing/Playwright.md` -> `learn/guides/testing/UnitTesting.md`.
>     -   Updated the content to explicitly focus on the single-thread Node.js simulation mode.
> 2.  **Created:** `learn/guides/testing/ComponentTesting.md`.
>     -   Documented the browser-based testing architecture using the `empty-viewport` app.
>     -   Detailed the usage of the `neo` fixture for interacting with components.
>     -   Explained the single-worker constraint.
> 3.  **Updated:** `learn/tree.json` to reflect the new structure.
> 
> The testing documentation now has distinct entry points for Unit and Component testing.

- 2026-01-26T10:17:47Z @tobiu closed this issue

