# Epic: Enhance Development Workflow with Mandatory Unit Testing

GH ticket id: #7262

**Assignee:**
**Status:** In Progress

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

## Sub-Tasks

### Setup & Refactoring
- **Done:** ticket-install-playwright-and-convert-test.md
- **Done:** ticket-refactor-playwright-setup.md
- **Done:** ticket-refactor-playwright-config.md
- **Done:** ticket-correct-playwright-output-dir.md

### Test Migrations
- **Done:** ticket-refactor-playwright-and-convert-vdom-helper.md (covers `VdomHelper.mjs`)
- **Done:** ticket-convert-core-effect-test.md (covers `core/Effect.mjs`)
- **To Do:** ticket-convert-classconfigsandfields-test.md
- **To Do:** ticket-convert-classsystem-test.md
- **To Do:** ticket-convert-collectionbase-test.md
- **To Do:** ticket-convert-config-aftersetconfig-test.md
- **To Do:** ticket-convert-config-basic-test.md
- **To Do:** ticket-convert-config-circulardependencies-test.md
- **To Do:** ticket-convert-config-customfunctions-test.md
- **To Do:** ticket-convert-config-hierarchy-test.md
- **To Do:** ticket-convert-config-memoryleak-test.md
- **To Do:** ticket-convert-config-multilevelhierarchy-test.md
- **To Do:** ticket-convert-core-effectbatching-test.md
- **To Do:** ticket-convert-form-field-aftersetvaluesequence-test.md
- **To Do:** ticket-convert-functional-button-test.md
- **To Do:** ticket-convert-functional-htmltemplatecomponent-test.md
- **To Do:** ticket-convert-functional-parse5processor-test.md
- **To Do:** ticket-convert-managerinstance-test.md
- **To Do:** ticket-convert-neo-mixinstaticconfig-test.md
- **To Do:** ticket-convert-rectangle-test.md
- **To Do:** ticket-convert-state-createhierarchicaldataproxy-test.md
- **To Do:** ticket-convert-state-feedbackloop-test.md
- **To Do:** ticket-convert-state-provider-test.md
- **To Do:** ticket-convert-state-providernesteddataconfigs-test.md
- **To Do:** ticket-convert-vdom-advanced-test.md
- **To Do:** ticket-convert-vdom-layout-cube-test.md
- **To Do:** ticket-convert-vdom-table-container-test.md
- **To Do:** ticket-convert-vdom-vdomasymmetricupdates-test.md
- **To Do:** ticket-convert-vdom-vdomrealworldupdates-test.md
- **To Do:** ticket-convert-vdomcalendar-test.md
- **To Do:** ticket-explore-test-file-indexing.md
- **Done:** ticket-plan-remaining-siesta-migrations.md
