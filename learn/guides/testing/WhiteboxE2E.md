# Whitebox E2E Testing with Neural Link

Traditional end-to-end (E2E) testing treats the application as a "black box," interacting purely through DOM element locators (e.g. `page.locator('button')`) and asserting visual outputs. In heavily virtualized environments like Neo.mjs, these tests can become flaky as DOM nodes are frequently recycled and state often resides in remote workers asynchronously decoupled from the main thread.

To tackle this, the Neo.mjs team pioneered the **Neural Link Bridge**. It allows our testing frameworks to penetrate the worker boundary, giving tests direct, synchronous access to the Neo.mjs runtime state. This is **Whitebox E2E Testing**.

## Why Whitebox E2E?

1. **State Over Locators:** Instead of attempting to find an ephemeral DOM node, you find the exact logical Component Instance (e.g., `GridContainer`, `ComboBox`) in the App Worker.
2. **Direct Value Assertions:** You can read exact runtime values (`component.value`, `component.store.getCount()`) bypassing asynchronous DOM polling.
3. **Targeted Interaction Navigation:** You combine Playwright's native DOM simulation with the semantic guarantees that the internal component is fully initialized and mapped to the UI.

## Setup Instructions

Whitebox tests are executed using typical Playwright tools but rely on the `neo-config.json` configuration and a specific E2E config suite.

**1. Enable Neural Link**
Inside your application directory (`examples/yourApp/`), you must ensure your `neo-config.json` mounts the AI client:

```json
{
    "appPath": "app.mjs",
    "theme"  : ["neo-theme-dark", "neo-theme-light"],
    "useAiClient": true
}
```

**2. Test Suite Config Target**
You MUST specify the E2E specific playwright config (`playwright.config.e2e.mjs`) when running these tests to ensure valid timeouts and environments.

```bash
npx playwright test test/playwright/e2e/YourTestNL.spec.mjs -c test/playwright/playwright.config.e2e.mjs
```

## Connecting the Neural Link

Whitebox E2E tests are located in `test/playwright/e2e/`. Every test hooks into the Neural Link via the `beforeAll` and `afterAll` Playwright lifecycle events. 

### Core Connection Boilerplate
When tests launch, they mount the browser context, intercept the `NeuralLink_ComponentService`, and extract the `sessionId` for the specific App Worker.

```javascript
import { test, expect } from '@playwright/test';
import { setupNeuralLink, getBaseUrl } from '../../setup-nl.mjs';

const targetUrl = `${getBaseUrl()}examples/grid/bigData/index.html`;

test.describe('Grid BigData App (Neural Link)', () => {
    let page;
    let nlClient; // The Neural Link interface
    let sessionId; // The App worker instance Session ID

    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext();
        page = await context.newPage();

        // 1. Hook the client logic to your URL
        const setup = await setupNeuralLink(page, targetUrl);
        nlClient = setup.nlClient;
        sessionId = setup.sessionId;
    });

    test.afterAll(async () => {
        if (nlClient) {
            nlClient.disconnect();
        }
    });

    // Tests go here...
});
```

## Component Queries & State Inspection

The core of Whitebox testing rests on `queryComponent`. By calling it through the `nlClient`, you find components by semantic layout rather than DOM classes.

```javascript
// A simple semantic query
const comboQuery = {
    selector: {
        ntype: 'combobox', 
        name: 'amountRows'
    },
    // Extract exact properties directly from the instance!
    returnProperties: ['value']
};

const result = await nlClient.request('mcp_neo-mjs-neural-link_query_component', {
    sessionId,
    ...comboQuery
});

// The returned value is wrapped inside a 'properties' object envelope.
// Important: Store records and complex objects are serialized.
expect(result.properties.value.id).toBe("20000"); 
```

### Advanced Discovery

Queries can also be hierarchically bounded using `rootId`. For complex, deeply nested grids, it is extremely beneficial to first discover Structural Primitives so that tests run more securely.

```javascript
let gridContainerId;

test('Verify foundational grid structure', async () => {
    // 1. Fetch MainView (It will always return the root wrapper)
    const viewResult = await nlClient.request('mcp_neo-mjs-neural-link_query_component', {
        sessionId,
        selector: { className: 'Neo.examples.grid.bigData.MainContainer' }
    });
    
    // 2. Discover children inside the root scope
    const gridResult = await nlClient.request('mcp_neo-mjs-neural-link_query_component', {
        sessionId,
        rootId: viewResult.id,
        selector: { ntype: 'grid-container' }
    });

    gridContainerId = gridResult.id;
    expect(gridContainerId).toBeDefined();
});
```

## A Complete Example Walkthrough

Let's look at how Whitebox testing effectively validates complex grid data inputs, without writing a single CSS locator for the inner workings.

This test simulates interaction on the Grid row counter and uses Neural Link to assert the engine accurately digested the new variable asynchronously.

```javascript
test('Simulate DOM selection and verify Neo.mjs engine data', async () => {
    // 1. Visually identify the ComboBox using typical Playwright Locator on the DOM wrapper layer
    const rowComboBox = page.locator('.neo-combobox').filter({ hasText: 'Amount Rows' });

    // Simulate standard user input
    await rowComboBox.click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // 2. Validate Engine Memory. Was the data actually stored by the Application Worker?
    const engineResult = await nlClient.request('mcp_neo-mjs-neural-link_query_component', {
        sessionId,
        selector: { ntype: 'combobox', name: 'amountRows' },
        returnProperties: ['value']
    });

    // Instead of looking for DOM text reading '40k', we verify what the class actually believes to be true.
    expect(engineResult.properties.value.id).toBe("40000");
});
```

Using this architecture, you get the absolute best of both paradigms: Playwright manages browser/input simulation with massive parity while the Neural Link ensures you never have to guess about component health or internal state logic.
