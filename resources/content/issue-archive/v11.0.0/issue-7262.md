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
  - '[x] 7256 Refactor Playwright Setup Function for Test-Specific Configurations'
  - '[x] 7261 Convert core/Effect.mjs Siesta Test to Playwright'
  - '[x] 7260 Correct Playwright Output Directory'
  - '[x] 7258 Refactor Playwright Setup and Convert VdomHelper Test'
  - '[x] 7255 Refactor Playwright Test Configuration'
  - '[x] 7254 Install Playwright and Convert First Siesta Test'
  - '[x] 7263 Plan Remaining Siesta to Playwright Test Migrations'
  - '[x] 7267 Convert ClassConfigsAndFields.mjs Test from Siesta to Playwright'
  - '[x] 7268 Convert ClassSystem.mjs Test from Siesta to Playwright'
  - '[x] 7269 Convert CollectionBase.mjs Test from Siesta to Playwright'
  - '[x] 7270 Convert ManagerInstance.mjs Test from Siesta to Playwright'
  - '[x] 7271 Convert Rectangle.mjs Test from Siesta to Playwright'
  - '[x] 7272 Convert VdomCalendar.mjs Test from Siesta to Playwright'
  - '[x] 7273 Convert config/AfterSetConfig.mjs Test from Siesta to Playwright'
  - '[x] 7274 Convert config/Basic.mjs Test from Siesta to Playwright'
  - '[x] 7275 Convert config/CircularDependencies.mjs Test from Siesta to Playwright'
  - '[x] 7276 Convert config/CustomFunctions.mjs Test from Siesta to Playwright'
  - '[x] 7277 Convert config/Hierarchy.mjs Test from Siesta to Playwright'
  - '[x] 7278 Convert config/MemoryLeak.mjs Test from Siesta to Playwright'
  - '[x] 7279 Convert config/MultiLevelHierarchy.mjs Test from Siesta to Playwright'
  - '[x] 7280 Convert core/EffectBatching.mjs Test from Siesta to Playwright'
  - '[x] 7281 Convert form/field/AfterSetValueSequence.mjs Test from Siesta to Playwright'
  - '[x] 7282 Convert functional/Button.mjs Test from Siesta to Playwright'
  - '[x] 7283 Convert functional/HtmlTemplateComponent.mjs Test from Siesta to Playwright'
  - '[x] 7284 Convert functional/Parse5Processor.mjs Test from Siesta to Playwright'
  - '[x] 7285 Convert neo/MixinStaticConfig.mjs Test from Siesta to Playwright'
  - '[x] 7286 Convert state/createHierarchicalDataProxy.mjs Test from Siesta to Playwright'
  - '[x] 7287 Convert state/FeedbackLoop.mjs Test from Siesta to Playwright'
  - '[x] 7288 Convert state/Provider.mjs Test from Siesta to Playwright'
  - '[x] 7289 Convert state/ProviderNestedDataConfigs.mjs Test from Siesta to Playwright'
  - '[x] 7290 Convert vdom/Advanced.mjs Test from Siesta to Playwright'
  - '[x] 7291 Convert vdom/VdomAsymmetricUpdates.mjs Test from Siesta to Playwright'
  - '[x] 7292 Convert vdom/VdomRealWorldUpdates.mjs Test from Siesta to Playwright'
  - '[x] 7293 Convert vdom/layout/Cube.mjs Test from Siesta to Playwright'
  - '[x] 7294 Convert vdom/table/Container.mjs Test from Siesta to Playwright'
subIssuesCompleted: 35
subIssuesTotal: 35
blockedBy: []
blocking: []
closedAt: '2025-11-04T10:56:27Z'
---
# Enhance Development Workflow with Mandatory Unit Testing

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

## Timeline

- 2025-09-27T11:14:32Z @tobiu assigned to @tobiu
- 2025-09-27T11:14:34Z @tobiu added the `enhancement` label
- 2025-09-27T11:14:34Z @tobiu added the `epic` label
- 2025-09-27T11:16:10Z @tobiu added sub-issue #7256
- 2025-09-27T11:16:31Z @tobiu added sub-issue #7261
- 2025-09-27T11:16:49Z @tobiu added sub-issue #7260
- 2025-09-27T11:17:18Z @tobiu added sub-issue #7258
- 2025-09-27T11:18:05Z @tobiu added sub-issue #7255
- 2025-09-27T11:18:21Z @tobiu added sub-issue #7254
- 2025-09-27T11:19:29Z @tobiu added sub-issue #7263
- 2025-09-27T11:20:32Z @tobiu referenced in commit `0c4d5d2` - "#7262 Internal tickets"
- 2025-09-27T12:05:33Z @tobiu added sub-issue #7266
- 2025-09-27T12:06:30Z @tobiu referenced in commit `b21e045` - "#7262 Internal tickets"
- 2025-09-27T12:33:57Z @tobiu added sub-issue #7267
- 2025-09-27T12:36:17Z @tobiu added sub-issue #7268
- 2025-09-27T12:37:42Z @tobiu added sub-issue #7269
- 2025-09-27T12:39:38Z @tobiu added sub-issue #7270
- 2025-09-27T12:40:56Z @tobiu added sub-issue #7271
- 2025-09-27T12:47:59Z @tobiu added sub-issue #7272
- 2025-09-27T13:17:59Z @tobiu added sub-issue #7273
- 2025-09-27T13:19:28Z @tobiu added sub-issue #7274
- 2025-09-27T13:33:19Z @tobiu added sub-issue #7275
- 2025-09-27T13:34:47Z @tobiu added sub-issue #7276
- 2025-09-27T13:36:16Z @tobiu added sub-issue #7277
- 2025-09-27T13:37:48Z @tobiu added sub-issue #7278
- 2025-09-27T13:39:02Z @tobiu added sub-issue #7279
- 2025-09-27T13:40:02Z @tobiu added sub-issue #7280
- 2025-09-27T13:52:06Z @tobiu added sub-issue #7281
- 2025-09-27T13:54:09Z @tobiu added sub-issue #7282
- 2025-09-27T13:55:26Z @tobiu added sub-issue #7283
- 2025-09-27T13:56:25Z @tobiu added sub-issue #7284
- 2025-09-27T13:57:44Z @tobiu added sub-issue #7285
- 2025-09-27T13:58:46Z @tobiu added sub-issue #7286
- 2025-09-27T13:59:49Z @tobiu added sub-issue #7287
- 2025-09-27T14:01:28Z @tobiu added sub-issue #7288
- 2025-09-27T14:02:38Z @tobiu added sub-issue #7289
- 2025-09-27T14:04:19Z @tobiu added sub-issue #7290
- 2025-09-27T14:05:15Z @tobiu added sub-issue #7291
- 2025-09-27T14:06:31Z @tobiu added sub-issue #7292
- 2025-09-27T14:07:48Z @tobiu added sub-issue #7293
- 2025-09-27T14:09:13Z @tobiu added sub-issue #7294
- 2025-09-27T14:41:22Z @tobiu referenced in commit `bfd1bf2` - "#7262 epic update => migration guide"
- 2025-09-30T10:37:12Z @tobiu referenced in commit `f9c97b4` - "#7262 changed Button test filename to upper case, ClassConfigsAndFields.spec.mjs: reassigned classes when calling setupClass() for consistency"
- 2025-10-02T19:57:53Z @tobiu referenced in commit `d9c4d4b` - "#7262 updated internal tickets"
- 2025-11-04T10:56:16Z @tobiu removed sub-issue #7266
### @tobiu - 2025-11-04T10:56:27Z

resolved.

- 2025-11-04T10:56:27Z @tobiu closed this issue

