# Component Testing with Playwright

Component testing in Neo.mjs differs significantly from [Unit Testing](UnitTesting.md). While unit tests run in a simulated, single-thread Node.js environment, **Component Tests run in a real browser**.

This allows you to verify:
1.  **DOM Events**: Real clicks, hovers, and focus events.
2.  **Visual Layout**: Computed styles, positioning, and visibility.
3.  **Worker Communication**: The actual `postMessage` traffic between the App Worker and the Main Thread.
4.  **Browser APIs**: Interaction with `ResizeObserver`, `IntersectionObserver`, and other browser-native features.

## Architecture

Component tests use a unique "Remote Control" architecture:

1.  **The Test Runner (Playwright)**: Launches a browser instance.
2.  **The Test App (`apps/empty-viewport`)**: A minimal Neo.mjs application that provides an empty `Viewport` container.
3.  **The Bridge (`RmaHelpers`)**: A set of global helpers injected into the browser that allow Playwright to send commands (like "Create Component") to the App Worker.
4.  **The `neo` Fixture**: A convenient Playwright fixture that wraps the bridge, giving you a clean API in your tests.

## Running Component Tests

To run the browser-based component tests:

```bash
npm run test-components
```

**Note:** Component tests run sequentially (single worker) to prevent state pollution in the shared `empty-viewport` app.

## Developer Workflow

### 1. Running a Single File
To run a specific component test file, point to the component config:

```bash
npx playwright test test/playwright/component/my/file.spec.mjs -c test/playwright/playwright.config.component.mjs
```

### 2. Visual Debugging
Component tests are visual by nature. Use `--headed` to watch the browser execution:

```bash
# Run with a visible browser window
npx playwright test test/playwright/component/my/file.spec.mjs -c test/playwright/playwright.config.component.mjs --headed

# Run with the Inspector to step through
npx playwright test test/playwright/component/my/file.spec.mjs -c test/playwright/playwright.config.component.mjs --debug
```

### 3. Verify Isolation
Since component tests share the same `apps/empty-viewport`, ensure you run the full suite (`npm run test-components`) before committing to verify that your tests clean up after themselves (using `neo.destroyComponent`) and don't leave artifacts that break subsequent tests.

## Writing a Component Test

The recommended way to write component tests is using the custom `neo` fixture provided by `test/playwright/fixtures.mjs`.

### 1. Basic Setup

Create a new file in `test/playwright/component/`. You must import `test` and `expect` from the fixtures file, NOT from `@playwright/test` directly.

```javascript
import { test, expect } from '../../fixtures.mjs'; // <--- Import from fixtures

test.describe('My Component Test', () => {
    // Navigate to the empty test app before each test
    test.beforeEach(async ({ page }) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');
    });

    test('should render and interact', async ({ neo, page }) => {
        // ... test logic ...
    });
});
```

### 2. Creating Components

Use `neo.createComponent()` to instantiate a component inside the App Worker. You pass a standard Neo.mjs config object.

```javascript
test('should render a button', async ({ neo, page }) => {
    // 1. Create the component
    const result = await neo.createComponent({
        className: 'Neo.button.Base',
        parentId : 'component-test-viewport', // Render into the main viewport
        text     : 'Click Me',
        iconCls  : 'fa fa-home'
    });

    const buttonId = result.id;

    // 2. Use Playwright locators to interact with the REAL DOM
    const button = page.locator(`#${buttonId}`);
    await expect(button).toBeVisible();
    await expect(button).toHaveText('Click Me');
});
```

### 3. Interacting with State

You can read and write component configurations dynamically using the `neo` fixture.

```javascript
test('should react to config changes', async ({ neo, page }) => {
    // ... create button ...

    // 1. Update config via App Worker
    await neo.setConfig(buttonId, {
        text: 'Updated Text',
        iconCls: 'fa fa-user'
    });

    // 2. Verify DOM update
    await expect(page.locator(`#${buttonId}`)).toHaveText('Updated Text');
    await expect(page.locator(`#${buttonId} .fa-user`)).toBeVisible();

    // 3. Read config from App Worker
    const currentText = await neo.getConfig(buttonId, 'text');
    expect(currentText).toBe('Updated Text');
});
```

### 4. Cleanup

Unlike Unit Tests, the `empty-viewport` app persists between tests in the same file if you don't clean up. It is best practice to destroy components in `afterEach`.

```javascript
test.afterEach(async ({ neo }) => {
    if (componentId) {
        await neo.destroyComponent(componentId);
    }
});
```

## The `neo` Fixture API

The `neo` fixture provides the following methods:

| Method | Description |
| :--- | :--- |
| `createComponent(config)` | Creates a component in the App Worker. Returns `{ success, id }`. |
| `destroyComponent(id)` | Destroys a component instance. |
| `setConfig(id, config)` | Updates one or more configs on an instance. |
| `getConfig(id, key)` | Retrieves a config value from an instance. |
| `waitForReady()` | Waits for the Neo framework to be fully initialized. |
| `page` | Access to the underlying Playwright Page object. |

## Advanced: Loading Modules

Sometimes you need to test a component that isn't loaded by default in the `empty-viewport` app. You have two options to load modules dynamically.

**Warning:** These methods rely on dynamic imports that are ignored by webpack (`/* webpackIgnore: true */`). They work in development and testing environments but will fail in production builds if the chunks are not available.

### Option 1: The `loadModule` Helper

You can manually load a module before using it.

```javascript
// Load the class definition first
await neo.loadModule('../../src/button/Base.mjs');

// Then create the instance
await neo.createComponent({
    className: 'Neo.button.Base',
    text     : 'Loaded Manually'
});
```

### Option 2: The `importPath` Shortcut

The `createComponent` method accepts an `importPath` config. This is a convenient shortcut that loads the module *before* attempting to create the instance.

```javascript
await neo.createComponent({
    className : 'Neo.button.Base',
    importPath: '../../src/button/Base.mjs', // <--- Lazy load and create in one step
    text      : 'Lazy Loaded Button'
});
```

## When to use Component vs. Unit Tests?

| Feature | Unit Tests (`test-unit`) | Component Tests (`test-components`) |
| :--- | :--- | :--- |
| **Environment** | Simulated Node.js | Real Browser (Chrome/Firefox/Webkit) |
| **Speed** | Instant (< 10ms) | Slower (Browser launch + Navigation) |
| **Focus** | Logic, State, VDOM diffing | DOM Events, CSS, Layout, Integration |
| **Threads** | Single Thread | Multi-Thread (Main + App + VDom + Data) |

**Recommendation:**
*   Use **Unit Tests** for 90% of your logic (Controllers, Stores, VDOM logic).
*   Use **Component Tests** only when you verify actual DOM interaction, CSS rendering, or complex browser-specific behaviors.

## Beyond the Empty Viewport

While the `empty-viewport` app is great for isolated component testing, the Playwright harness is flexible enough to handle broader scenarios.

### 1. Testing Full Applications (E2E)
You are not limited to the test harness. You can point your test to *any* Neo.mjs application entry point to perform Integration or E2E tests.

```javascript
test.beforeEach(async ({ page }) => {
    // Load a real application
    await page.goto('apps/realworld/index.html');
    await page.waitForSelector('.neo-viewport');
});
```

This allows you to test user flows (e.g., "Login -> Navigate -> Submit Form") using the same API.

### 2. Custom Test Harnesses
If you find yourself repeatedly setting up complex component trees (e.g., a Grid with specific stores and plugins), you can create a dedicated test app (e.g., `test/harness/my-grid-harness/index.html`).

Instead of `createComponent()`, your test would simply load this custom app, which comes pre-configured with the state you want to verify.

## Future Roadmap: Deep E2E

The current component testing bridge ("RMA Helpers") provides basic interactions but has limited visibility into the App Worker's internal state (Stores, Managers, Worker Threads).

We are actively exploring **"Deep E2E"** testing powered by the **Neural Link**. This will allow tests to:
*   Inspect internal Store data directly (White-Box testing).
*   Verify state across multiple windows seamlessly.
*   Hot-patch code during runtime for advanced assertions.

This capability is tracked in **[Issue #8851](https://github.com/neomjs/neo/issues/8851)**. If this feature is important to your workflow, please leave a comment on the ticket to help us prioritize it.
