---
id: 7470
title: 'PoC: Create Component Test for component.Image'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-12T12:57:29Z'
updatedAt: '2025-10-12T13:35:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7470'
author: tobiu
commentsCount: 1
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-12T13:35:19Z'
---
# PoC: Create Component Test for component.Image

**Reported by:** @tobiu on 2025-10-12

---

**Parent Issue:** #7435 - Create Component Tests in Playwright (and migrate existing tests from Siesta)

---

This was a high-priority Proof of Concept (PoC) task to create the very first component test using our new Playwright test harness. The goal was to test a simple component, `Neo.component.Image`, to establish a definitive, working pattern for all future component test migrations.

This PoC successfully resolved key unknowns (like module pathing and RMA usage) and now serves as the primary blueprint for other contributors.

## Acceptance Criteria

1.  A new test file was created at `test/playwright/component/specs/image.spec.mjs`.
2.  The `beforeEach` hook first navigates to the `empty-viewport` harness using `page.goto('test/playwright/component/apps/empty-viewport/index.html')`.
3.  The test waits for the harness to be ready using `await page.waitForSelector('#component-test-viewport')`.
4.  A `Neo.component.Image` instance is created using the `Neo.worker.App.createNeoInstance()` RMA method.
    *   The component's module is loaded using the `importPath` config (e.g., `importPath: '../component/Image.mjs'`).
    *   The component is mounted into the test viewport using the `parentId: 'component-test-viewport'` config.
    *   Image sources (`src`) use local, relative paths to project assets (e.g., `../../../../../resources/images/logo/neo_logo_primary.svg`).
5.  The component instance is destroyed in an `afterEach` hook using the `Neo.worker.App.destroyNeoInstance()` RMA method.
6.  **Test Case 1 (Initial Render):** Verified that the initial `src` and `alt` attributes were correctly rendered in the DOM.
7.  **Test Case 2 (Reactivity):** Used the `Neo.worker.App.setConfigs()` RMA method to change the `src` and `alt` configs and asserted that the DOM attributes updated correctly.
8.  The test suite passed successfully.

## Comments

### @tobiu - 2025-10-12 13:35

FYI @Aki-07 this one works now.

