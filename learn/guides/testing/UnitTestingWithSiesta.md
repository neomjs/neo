# Testing in Neo.mjs with Siesta

This guide provides a comprehensive introduction to testing your Neo.mjs applications. A robust test suite is crucial for building maintainable, high-quality applications.

Neo.mjs utilizes the Siesta framework and provides two distinct testing harnesses, each for a specific purpose:

1.  **Pure Unit Testing (`/test/siesta/`)**: For testing business logic, data classes, and component VDOM generation *without* rendering to the real DOM.
2.  **Component Integration Testing (`/test/components/`)**: For testing the lifecycle, rendering, and user interaction of components in a real DOM environment.

Understanding which harness to use is key to writing effective tests.

---

## 1. Pure Unit Testing (No DOM Rendering)

This is your go-to for testing the core logic of your application. Because it doesn't involve the DOM, it is faster and ideal for testing algorithms, data manipulation, and the VDOM output of components.

**Use this for:**
- Testing non-visual classes (Utilities, Controllers, Stores, Models).
- Verifying a component's VDOM structure based on its configuration.
- Testing a component's reactive logic by asserting VDOM "deltas" after config changes.

**Test Runner:** `/test/siesta/index.html`

### Setup and Anatomy

A typical unit test file lives in `/test/siesta/tests/` and follows this structure:

```javascript readonly
// test/siesta/tests/MyTest.mjs
import Neo from '../../../src/Neo.mjs';

StartTest(t => {
    t.it('Should perform a basic check', t => {
        t.is(1 + 1, 2, 'The most basic assertion should pass');
    });

    t.it('Should test an asynchronous operation', async t => {
        const result = await new Promise(resolve => setTimeout(() => resolve('done'), 100));
        t.is(result, 'done', 'Asynchronous operation completed successfully');
    });
});
```

- **`StartTest(t => { ... })`**: The main wrapper for the test suite.
- **`t`**: The test context object, containing assertion methods.
- **`t.it('description', t => { ... })`**: Defines an individual test case.

### Testing Component VDOM

When testing components, you must enable a special `unitTestMode` that prevents rendering to the real DOM.

#### a. Test Environment Setup

At the top of your component test file, configure the environment and create a mock application context.

```javascript readonly
import Neo from '../../../../src/Neo.mjs';
import MyButton from '../../../../src/button/MyButton.mjs';

// 1. Configure the environment for VDOM testing
Neo.config.unitTestMode = true;
Neo.config.allowVdomUpdatesInTests = true;
Neo.config.useDomApiRenderer = true;

// 2. Create a mock application context
const appName = 'MyButtonTestApp';
Neo.apps = Neo.apps || {};
Neo.apps[appName] = {
    name: appName,
    fire: Neo.emptyFn,
    isMounted: () => true,
    vnodeInitialising: false
};
```

#### b. Testing Workflow

The core pattern is to create a component, inspect its initial VDOM, change its state, and then inspect the VDOM "deltas" (the minimal changes).

```javascript readonly
StartTest(t => {
    let button, vnode;

    t.beforeEach(async t => {
        button = Neo.create(MyButton, {
            appName,
            text: 'Initial Text'
        });
        ({vnode} = await button.initVnode());
        button.mounted = true; // Mock the mounted state
    });

    t.afterEach(t => {
        button?.destroy();
        button = null;
        vnode = null;
    });

    t.it('should create initial vnode correctly', t => {
        t.expect(vnode.nodeName).toBe('button');
        const textNode = vnode.childNodes[0];
        t.expect(textNode.textContent).toBe('Initial Text');
    });

    t.it('should generate a VDOM delta on config change', async t => {
        const textNodeId = vnode.childNodes[0].id;

        // Change a config property
        const {deltas} = await button.set({text: 'New Text'});

        // Assert the generated delta
        t.is(deltas.length, 1, 'Should generate exactly one delta');
        const delta = deltas[0];
        t.is(delta.id, textNodeId, 'Delta should target the text node');
        t.is(delta.textContent, 'New Text', 'Delta textContent is correct');
    });
});
```

---

## 2. Component Integration Testing (With DOM Rendering)

This harness is for testing what your users will actually see and interact with. It launches a real, albeit empty, Neo.mjs application in a worker and renders components into the browser's DOM.

**Use this for:**
- Verifying that a component renders the correct HTML.
- Testing component lifecycle methods (`onConstructed`, `mounted`, etc.).
- Simulating user interactions (not yet covered, but this is where it would go).
- Testing complex component behaviors that rely on the DOM.

**Test Runner:** `/test/components/index.html`

### Setup and Anatomy

This setup is architecturally different. The test code runs in the **main thread**, while the components live in the **app worker**. Communication happens via an asynchronous API.

1.  **Add Component to App:** First, ensure the component you want to test is imported into the test app shell at `/test/components/app.mjs`.
2.  **Create Test File:** Create your test file in `/test/components/files/`.
3.  **Add to Test Plan:** Add the file's path to `/test/components/siesta.js`.

### Testing Workflow

The key difference is the use of `Neo.worker.App` to create and manipulate components in the other thread. Assertions are made against the real DOM using Siesta's selector-based methods.

```javascript readonly
// test/components/files/button/Base.mjs
StartTest(t => {
    let button;

    t.afterEach(async t => {
        // Destroy the component in the app worker
        if (button) {
            await Neo.worker.App.destroyNeoInstance(button);
            button = null;
        }
    });

    t.it('Should render a button in the DOM', async t => {
        // Asynchronously create the component in the app worker
        button = await Neo.worker.App.createNeoInstance({
            ntype: 'button',
            text : 'Hello Siesta'
        });

        // Use Siesta's DOM assertions
        await t.waitForSelector('button');
        t.selectorExists('button:contains(Hello Siesta)');
    });

    t.it('Should update the DOM when configs change', async t => {
        button = await Neo.worker.App.createNeoInstance({
            ntype    : 'button',
            isLoading: false
        });

        await t.waitForSelector('button');
        t.selectorNotExists('button .fa-spinner');

        // Asynchronously update the component's config
        await Neo.worker.App.setConfigs({id: button, isLoading: true});

        // Assert the DOM has updated
        await t.waitForSelector('button .fa-spinner');
        t.selectorExists('button .fa-spinner.fa-spin');
    });
});
```

- **`Neo.worker.App.createNeoInstance()`**: Asynchronously creates a component in the app worker and renders it. Returns a lightweight proxy object.
- **`Neo.worker.App.setConfigs()`**: Asynchronously updates configs on a component instance in the app worker.
- **`Neo.worker.App.destroyNeoInstance()`**: Asynchronously destroys the component instance.
- **`t.waitForSelector()` / `t.selectorExists()`**: Siesta methods that poll the DOM until a condition is met. These are essential for testing asynchronous rendering and updates.

## Summary: Which Harness Should I Use?

| Scenario                               | Use Pure Unit Tests (`/test/siesta`) | Use Component Tests (`/test/components`) |
|----------------------------------------|:------------------------------------:|:----------------------------------------:|
| Testing a utility function             |                  ✅                  |                                          |
| Testing a Store's sorting logic        |                  ✅                  |                                          |
| Verifying a Button's VDOM `deltas`     |                  ✅                  |                                          |
| Checking if a Button renders a `<span>` |                                      |                    ✅                    |
| Testing a ComboBox's picker visibility |                                      |                    ✅                    |
| Testing a component's `mounted` logic  |                                      |                    ✅                    |
