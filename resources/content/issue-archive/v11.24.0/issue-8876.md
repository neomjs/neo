---
id: 8876
title: 'test: Fix Namespace Collisions in Unit Tests exposed by setupClass Guardrail'
state: CLOSED
labels:
  - refactoring
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-24T14:25:13Z'
updatedAt: '2026-01-24T15:26:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8876'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-24T14:47:55Z'
---
# test: Fix Namespace Collisions in Unit Tests exposed by setupClass Guardrail

**Description:**
We recently hardened `Neo.setupClass` to throw an error when `Neo.config.unitTestMode` is true and a namespace collision occurs. This prevents test isolation issues where different tests unintentionally share or overwrite class definitions.

This change has exposed existing collisions in our test suite, where multiple test files define classes with generic names like `Mock.Component` or `Test.Container`.

**Goals:**
1.  **Enforce Unique ClassNames:** Update all failing tests to use unique, file-specific class names (e.g., `Test.Unit.Vdom.TreeBuilder.MockComponent`).
2.  **Verify Stability:** Ensure the entire Playwright unit test suite passes with the new guardrail in place.

**Known Failures:**
*   `test/playwright/unit/state/ProviderNestedDataConfigs.spec.mjs` (`Mock.Component`)
*   `test/playwright/unit/vdom/TreeBuilder.spec.mjs` (`Test.MockComponent`)
*   `test/playwright/unit/vdom/VdomLifecycle.spec.mjs` (`Test.MockComponent`)
*   `test/playwright/unit/vdom/VdomMerging.spec.mjs` (`Test.Container`)

**Action Plan:**
Iterate through the failing tests and rename the test classes to be unique.

## Timeline

- 2026-01-24T14:25:14Z @tobiu added the `refactoring` label
- 2026-01-24T14:25:14Z @tobiu added the `testing` label
- 2026-01-24T14:25:14Z @tobiu added the `core` label
- 2026-01-24T14:45:42Z @tobiu referenced in commit `350770c` - "test: Fix Namespace Collisions in Unit Tests exposed by setupClass Guardrail (#8876)"
- 2026-01-24T14:46:21Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-24T14:46:44Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the namespace collisions in the unit test suite and enabled the new `setupClass` guardrail.
> 
> **Implementation Details:**
> 1.  **Hardened `Neo.setupClass`:** Modified `src/Neo.mjs` to throw a specific error (`Namespace collision in unitTestMode`) when a namespace is redefined while `Neo.config.unitTestMode` is true. This ensures strict isolation for unit tests.
> 2.  **Fixed Test Suite Collisions:** I identified and renamed colliding class definitions in the following test files to be unique and file-specific:
>     *   `test/playwright/unit/state/ProviderNestedDataConfigs.spec.mjs`: `Mock.Component` -> `Test.Unit.State.ProviderNestedDataConfigs.MockComponent`
>     *   `test/playwright/unit/vdom/TreeBuilder.spec.mjs`: `Test.MockComponent` -> `Test.Unit.Vdom.TreeBuilder.MockComponent`
>     *   `test/playwright/unit/vdom/VdomLifecycle.spec.mjs`: `Test.MockComponent` -> `Test.Unit.Vdom.VdomLifecycle.MockComponent`
>     *   `test/playwright/unit/vdom/VdomMerging.spec.mjs`: `Test.Container` -> `Test.Unit.Vdom.VdomMerging.Container`
>     *   `test/playwright/unit/core/ClassConfigsAndFields.spec.mjs`: `Neo.TestClass` -> `Test.Unit.Core.ClassConfigsAndFields.TestClass` and fixed `Neo.core.Base` collision.
>     *   `test/playwright/unit/core/ClassSystem.spec.mjs`: `Neo.TestClass` -> `Test.Unit.Core.ClassSystem.TestClass`
> 
> **Note:** The `setupClass` change is being committed NOW as part of this PR, effectively activating the guardrail for all future test runs.
> 
> The full unit test suite now passes with strict namespace enforcement enabled.

- 2026-01-24T14:47:56Z @tobiu closed this issue

