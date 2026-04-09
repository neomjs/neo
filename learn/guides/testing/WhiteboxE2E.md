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

## Connecting the Neural Link (Fixtures)

Whitebox E2E tests are located in `test/playwright/e2e/`. Instead of manually establishing WebSocket connections, the Neo.mjs team provides a powerful Playwright fixture called `neuralLink`.

### Core Connection Boilerplate
When tests launch, you can use the `neuralLink` parameter injected by Playwright. This abstracts away the internal component architecture and exposes a simple SDK.

```javascript
import { test, expect } from '../../fixtures.mjs'; // Use custom fixtures!

test.describe('Grid BigData App (Neural Link)', () => {

    test('Verify connection and inspect state', async ({ page, neuralLink }) => {
        // 1. Navigate to the app inside the browser worker
        await page.goto('examples/grid/bigData/index.html');

        // 2. Connect the fixture to the running App Worker
        // The intent here is to explicitly pass the application name 
        // to `connectToApp()`. While the fixture has fallback logic to infer the name 
        // from the window path, explicit declarations prevent initialization races 
        // and ensure the test strictly targets the intended App Worker environment.
        // 
        // Examples use their fully qualified namespace:
        const nlApp = await neuralLink.connectToApp('Neo.examples.grid.bigData');
        
        // Full Applications use their named string identifier:
        // const nlApp = await neuralLink.connectToApp('DevIndex');

        // Tests go here...
    });
});
```

## Component Queries & State Inspection

The core of Whitebox testing rests on `queryComponent`. By calling it through the `nlApp` fixture, you find components by semantic layout rather than DOM classes.

```javascript
// Extract exact properties directly from the instance!
const queryResult = await nlApp.queryComponent(
    { ntype: 'combobox', name: 'amountRows' }, // Selector
    ['value'] // Return Properties
);

// Important: Return properties are nested under `.properties`
// Store records and complex objects are serialized.
expect(queryResult.properties.value.id).toBe("20000"); 
```

### Advanced Discovery

Queries can also be hierarchically bounded by looking for children inside specific component graphs.

```javascript
test('Verify foundational grid structure', async ({ page, neuralLink }) => {
    await page.goto('examples/grid/bigData/index.html');

    // Securely bridge to the specific Application Worker
    const nlApp = await neuralLink.connectToApp('Neo.examples.grid.bigData');

    // 1. Fetch MainView (It will always return the root wrapper)
    const viewResult = await nlApp.queryComponent({ className: 'Neo.examples.grid.bigData.MainContainer' });
    
    // 2. Discover children inside the root scope
    // Note: The fixture currently masks rootId natively if we query globally, 
    // but the underlying API fully supports ID-scoped boundaries.
    const gridResult = await nlApp.queryComponent({ ntype: 'grid-container' });

    expect(gridResult.id).toBeDefined();
});
```

## A Complete Example Walkthrough

Let's look at how Whitebox testing effectively validates complex grid data inputs, without writing a single CSS locator for the inner workings.

This test simulates interaction on the Grid row counter and uses Neural Link to assert the engine accurately digested the new variable asynchronously.

```javascript
test('Simulate DOM selection and verify Neo.mjs engine data', async ({ page, neuralLink }) => {
    await page.goto('examples/grid/bigData/index.html');

    // Bound the bridge to the specific namespace to prevent inference races
    const nlApp = await neuralLink.connectToApp('Neo.examples.grid.bigData');

    // 1. Visually identify the ComboBox using typical Playwright Locator on the DOM wrapper layer
    const rowComboBox = page.locator('.neo-combobox').filter({ hasText: 'Amount Rows' });

    // Simulate standard user input
    await rowComboBox.click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // 2. Validate Engine Memory. Was the data actually stored by the Application Worker?
    const queryResult = await nlApp.queryComponent(
        { ntype: 'combobox', name: 'amountRows' },
        ['value']
    );

    // Instead of looking for DOM text reading '40k', we verify what the class actually believes to be true.
    expect(queryResult.properties.value.id).toBe("40000");
});
```

Using this architecture, you get the absolute best of both paradigms: Playwright manages browser/input simulation with massive parity while the Neural Link ensures you never have to guess about component health or internal state logic.
