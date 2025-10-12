---
title: 'PoC: Migrate Component Test for component.Image'
labels: enhancement, AI
---

GH ticket id: #7470

**Epic:** Migrate Component Tests from Siesta to Playwright (R&D)
**Phase:** 1
**Assignee:**
**Status:** To Do

## Description

This is a high-priority Proof of Concept (PoC) task to create the very first component test using our new Playwright test harness. The goal is to test a simple component, `Neo.component.Image`, to establish a definitive, working pattern for all future component test migrations.

This PoC will resolve any remaining unknowns (such as module pathing from within the test runner) and will serve as the primary blueprint for other Hacktoberfest contributors to follow.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/specs/image.spec.mjs`.
2.  The test must use the `empty-viewport` harness by navigating to its `index.html` in a `beforeEach` hook.
3.  A `Neo.component.Image` instance should be created before each test and destroyed after each test.
4.  **Test Case 1 (Initial Render):** Verify that the initial `src` and `alt` attributes are correctly rendered in the DOM.
5.  **Test Case 2 (Reactivity):** Use RMA (`page.evaluate`) to change the component's `src` config and assert that the `<img>` tag's `src` attribute updates accordingly in the DOM.
6.  **Test Case 3 (Reactivity):** Use RMA to change the `alt` config and assert that the `alt` attribute updates.
7.  The test suite must pass successfully.
