---
id: 7262
title: Enhance Development Workflow with Mandatory Unit Testing
state: CLOSED
labels:
  - enhancement
  - epic
assignees:
  - tobiu
createdAt: '2025-09-27T11:14:32Z'
updatedAt: '2025-11-04T10:56:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7262'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - 7256
  - 7261
  - 7260
  - 7258
  - 7255
  - 7254
  - 7263
  - 7267
  - 7268
  - 7269
  - 7270
  - 7271
  - 7272
  - 7273
  - 7274
  - 7275
  - 7276
  - 7277
  - 7278
  - 7279
  - 7280
  - 7281
  - 7282
  - 7283
  - 7284
  - 7285
  - 7286
  - 7287
  - 7288
  - 7289
  - 7290
  - 7291
  - 7292
  - 7293
  - 7294
subIssuesCompleted: 35
subIssuesTotal: 35
closedAt: '2025-11-04T10:56:27Z'
---
# Enhance Development Workflow with Mandatory Unit Testing

**Reported by:** @tobiu on 2025-09-27

---

**Sub-Issues:** #7256, #7261, #7260, #7258, #7255, #7254, #7263, #7267, #7268, #7269, #7270, #7271, #7272, #7273, #7274, #7275, #7276, #7277, #7278, #7279, #7280, #7281, #7282, #7283, #7284, #7285, #7286, #7287, #7288, #7289, #7290, #7291, #7292, #7293, #7294
**Progress:** 35/35 completed (100%)

---

## Scope

This epic outlines the plan to improve the stability of the Neo.mjs framework and enforce API consistency by integrating a mandatory testing step into the development workflow for all contributors, including AI agents.

The primary goal is to prevent regressions, especially in the complex core modules, and to ensure that all public-facing APIs (including configs) remain stable.

## Top-Level Items

1.  **Migrate Unit Tests to a Node.js Runner:**
    *   Systematically migrate the entire suite of unit tests from the browser-based Siesta harness to the Node.js-based Playwright runner.
    *   This makes the tests scriptable and executable from the command line, enabling automation.

2.  **Update Agent Workflow (`AGENTS.md`):**
    *   Amend the agent guidelines to include a new, mandatory step in the "Implementation Loop".
    *   Before any actionable ticket concerning stable, non-experimental code is considered complete, the agent **must** run the full Playwright unit test suite and confirm that all tests pass.
    *   This ensures that no change, however small, introduces a regression or an unintended API modification.

### Migration Guide & Best Practices

**CRITICAL:** All contributors (human or AI) assigned to a test migration task **MUST** follow these instructions to ensure consistency and prevent regressions.

1.  **Analyze Existing Examples:** Before starting, thoroughly review the already completed Playwright test `test/playwright/unit/VdomHelper.spec.mjs` and its original Siesta counterpart `test/siesta/tests/VdomHelper.mjs`. This will provide the blueprint for structure, assertions, and setup.

2.  **Do Not Remove Core Imports:** The Playwright unit tests run in a Node.js environment, not a browser. They require explicit imports to set up the Neo.mjs environment.
    ```javascript
    import Neo from '../../../src/Neo.mjs';
    import * as core from '../../../src/core/_export.mjs';
    ```
    Even if these imports appear "unused" in the test file, they are **ESSENTIAL**. They attach the `Neo` namespace to the `globalThis` object. Removing them will cause the test environment to fail. **DO NOT REMOVE THEM.**

3.  **Follow the Test Structure:**
    *   Use `test.describe()` to group tests for a class.
    *   Use `test()` for individual test cases.
    *   Use `expect()` from Playwright for assertions (`toEqual`, `toBe`, etc.).

4.  **Update Status:** Once a migration is complete and verified with `npm test`, update the status of the corresponding ticket to "Done" and, if possible, update its status in this epic.

5.  **Add Intent-Driven JSDoc:** At the top of the main `test.describe()` block for the test suite, add a JSDoc comment block. This block should include:
    *   A `@summary` tag explaining the primary purpose of the test suite.
    *   A brief description of what aspects of the class are being tested and why they are important.

6.  **Always Re-Assign After `setupClass`:** When defining a class locally for a test, you **MUST** re-assign the class variable to the return value of `Neo.setupClass()`. This ensures you are using the final, fully processed constructor. Failure to do so can lead to subtle inheritance bugs in the Node.js test environment.

    **Correct:**
    ```javascript
    class MyTestClass extends Base { /* ... */ }
    MyTestClass = Neo.setupClass(MyTestClass); // Re-assignment is crucial
    ```

    **Incorrect:**
    ```javascript
    class MyTestClass extends Base { /* ... */ }
    Neo.setupClass(MyTestClass); // Missing re-assignment
    ```

## Comments

### @tobiu - 2025-11-04 10:56

resolved.

