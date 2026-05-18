# Whitebox E2E Test Authoring Protocol

When tasked with creating new end-to-end tests for the Neo.mjs framework, you must follow the **Whitebox E2E** paradigm. Traditional "black box" DOM locator testing is brittle in Neo's highly virtualized worker environment.

<a id="the-pre-requisite-neural-link-exploration"></a>
## 1. The Pre-Requisite: Neural Link Exploration

**Before writing a single line of test code**, you MUST use the Neural Link to explore the application state live.
1. Use the `neural-link` skill to launch the application and connect to it mentally.
2. Use Neural Link tools (e.g. `get_component_tree`, `query_component`, `inspect_store`) to verify exactly how the components represent data and state in the App Worker.
3. Understand the difference between the visual DOM (what the user sees) and the logical component structure (what the `neuralLink` test fixture exposes).

*Do not guess the JSON structure of a component or a store. Read it live first.*

<a id="test-suite-scaffolding"></a>
## 2. Test Suite Scaffolding

Whitebox E2E tests belong in `test/playwright/e2e/`.
Always use the custom `neuralLink` Playwright fixture provided by the Neo.mjs team.

```javascript
import { test, expect } from '../../fixtures.mjs';

test.describe('Button Base Feature (Neural Link)', () => {
    test('Verify precise component state', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        // Explicitly bind the bridge to the application namespace
        const nlApp = await neuralLink.connectToApp('Neo.examples.button.base');

        // ... assertions
    });
});
```

*Crucial Note: Tests must be executed using the specific E2E config:*
`npx playwright test test/playwright/e2e/YourTest.spec.mjs -c test/playwright/playwright.config.e2e.mjs`

<a id="the-pattern-playwright-interaction-neural-link-validation"></a>
## 3. The Pattern: Playwright Interaction -> Neural Link Validation

Instead of querying DOM nodes for text content, the definitive Whitebox paradigm is:

1. **Interact Layout:** Use standard Playwright `page.locator()` to simulate gross user interactions (clicks, keyboard).
2. **Assert Engine Truth:** Use `nlApp.queryComponent()` to ask the *Component Instance* inside the remote App Worker what its state is.

```javascript
// 1. Visually identify and interact using Playwright
const rowComboBox = page.locator('.neo-combobox').filter({ hasText: 'Amount Rows' });
await rowComboBox.click();
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');

// 2. Validate Engine Memory using Neural Link SDK
const queryResult = await nlApp.queryComponent(
    { name: 'amountRows' },
    ['value']
);

// We verify the actual data object inside the App Worker, completely skipping DOM assertions!
expect(queryResult.properties.value.id).toBe("40000");
```

<a id="comprehensive-example"></a>
## 4. Comprehensive Example

Before authoring a new test, closely examine the following reference implementation which showcases deep state assertions, programmatic mutation, and DOM versus Worker Engine drift validation:
`test/playwright/e2e/ButtonBaseNL.spec.mjs`

<a id="telemetry-rlaif-integration"></a>
## 5. Telemetry & RLAIF Integration

Tests utilizing the `neuralLink` fixture inherently generate rich user interaction trajectories. These paths are extracted as structured datasets to continuously train the Swarm's autonomous agents.
The backend daemon `ai/scripts/analyzeNlTelemetry.mjs` curates these logs from the local `memory-core.sqlite` to generate the "Golden Path" SFT/DPO datasets used in Local SLM fine-tuning pipelines.

<a id="deep-dive-documentation"></a>
## 6. Deep Dive Documentation
For the complete API of the `neuralLink` test SDK (`nlApp`) including simulating native VNode events, VDOM querying, and complex store inspection, you MUST reference the foundational guide:
`learn/guides/testing/WhiteboxE2E.md`
