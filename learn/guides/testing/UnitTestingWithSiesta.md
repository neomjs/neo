# Unit Testing with Siesta

This guide provides a comprehensive introduction to writing unit tests for your Neo.mjs applications and components using the Siesta testing framework. A robust test suite is crucial for building maintainable, high-quality applications.

## Introduction to Siesta

Siesta is the integrated testing framework used by Neo.mjs. It allows you to run tests in a real browser environment, which is essential for verifying both business logic and DOM rendering. All tests are written as ES modules.

The main test runner can be accessed by navigating to the `/test/siesta/` directory in your application's web root.

## Setting Up a New Test File

Adding a new test to your project involves two simple steps:

1.  **Create the Test File:**
    Create a new `.mjs` file inside the `test/siesta/tests/` directory. It's good practice to mirror your `src/` directory structure. For example, a test for `src/form/field/MyField.mjs` could be placed at `test/siesta/tests/form/field/MyField.mjs`.

2.  **Add the File to the Test Plan:**
    Open `test/siesta/siesta.js`. This file contains the master plan for all tests. Add the path to your new test file to the `project.plan()` array. You can add it as a standalone file or within a `group`.

    ```javascript
    // In test/siesta/siesta.js
    project.plan(
        // ... other groups
        {
            group: 'form',
            items: [
                'tests/form/field/AfterSetValueSequence.mjs',
                'tests/form/field/MyField.mjs' // Add your new test here
            ]
        },
        // ... other tests
    );
    ```

## The Anatomy of a Test File

A typical Siesta test file has a simple structure. All test logic is wrapped in the `StartTest()` function.

```javascript
// test/siesta/tests/MyTest.mjs
import Neo from '../../../src/Neo.mjs';

StartTest(t => {
    // Your test code goes here

    t.it('Should perform a basic check', t => {
        t.is(1 + 1, 2, 'The most basic assertion should pass');
    });

    t.it('Should test an asynchronous operation', async t => {
        const result = await new Promise(resolve => setTimeout(() => resolve('done'), 100));
        t.is(result, 'done', 'Asynchronous operation completed successfully');
    });
});
```

-   **`StartTest(t => { ... })`**: The main wrapper for the test suite in a file.
-   **`t`**: The test context object. It contains all the assertion methods.
-   **`t.it('description', t => { ... })`**: Defines an individual test case. Using `async t` allows you to use `await` within your test.
-   **`t.is(value1, value2, 'description')`**: A common assertion to check for strict equality (`===`).

## Testing Core Logic

Testing non-component classes (e.g., utilities, data models) is straightforward. You can import the class, create instances, and assert their behavior directly.

```javascript
// test/siesta/tests/core/MyUtil.mjs
import MyUtil from '../../../../src/util/MyUtil.mjs';

StartTest(t => {
    t.it('Should correctly format a string', t => {
        const result = MyUtil.format('hello');
        t.is(result, 'HELLO', 'String should be capitalized');
    });
});
```

## Testing Components (Class-based & Functional)

Testing components is more involved because they interact with the VDOM and have a lifecycle. Neo.mjs tests run in a special `unitTestMode` where the real DOM is not updated, but we can inspect the generated virtual DOM.

### 1. Test Environment Setup

At the top of your component test file, you must configure the test environment. This involves enabling `unitTestMode` but allowing VDOM updates to be generated, and creating a mock application context.

```javascript
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

StartTest(t => {
    // ... your tests
});
```

### 2. The `beforeEach` and `afterEach` Hooks

To ensure tests are isolated, create and destroy a new component instance for each test case using the `beforeEach` and `afterEach` hooks.

```javascript
StartTest(t => {
    let button, vnode;

    t.beforeEach(async t => {
        button = Neo.create(MyButton, {
            appName, // Connect to the mock app
            text: 'Initial Text'
        });

        // Manually generate the initial VDOM
        ({vnode} = await button.initVnode());
        button.mounted = true; // Mock the mounted state
    });

    t.afterEach(t => {
        // Clean up the component instance
        button?.destroy();
        button = null;
        vnode = null;
    });

    // ... your t.it() blocks
});
```

### 3. Asserting the Initial State

Your first test should usually verify that the component's initial VDOM is rendered correctly based on its configuration.

```javascript
t.it('should create initial vnode correctly', async t => {
    t.expect(vnode.nodeName).toBe('button');
    t.expect(vnode.className).toEqual(['neo-button']);

    const textNode = vnode.childNodes[0];
    t.expect(textNode.className).toEqual(['neo-button-text']);
    t.expect(textNode.textContent).toBe('Initial Text');
});
```

### 4. Testing Reactivity and Updates

The most powerful part of component testing in Neo.mjs is verifying reactivity. You can change a component's config and assert that the correct, minimal VDOM update (a "delta") is generated.

Use the `component.set()` method, which returns a promise resolving with the generated `deltas`.

```javascript
t.it('should update vnode and create a delta on config change', async t => {
    const textNodeId = vnode.childNodes[0].id;

    // Change a config property
    const {deltas} = await button.set({text: 'New Text'});

    // Assert the generated delta
    t.is(deltas.length, 1, 'Should generate exactly one delta');
    const delta = deltas[0];

    t.is(delta.id, textNodeId, 'Delta should target the text node');
    t.is(delta.textContent, 'New Text', 'Delta textContent is correct');
});
```

This pattern allows you to test your component's `afterSet` hooks and other reactive logic with precision, ensuring they produce the expected VDOM changes without the overhead of a full browser render.

## Common Assertions

Here are some of the most common assertion methods available on the `t` object:

-   `t.is(got, expected, description)`: Checks for strict equality (`===`).
-   `t.isNot(got, unexpected, description)`: Checks for strict inequality (`!==`).
-   `t.isDeeply(got, expected, description)`: Performs a deep comparison of objects or arrays.
-   `t.ok(value, description)`: Checks if a value is truthy.
-   `t.notOk(value, description)`: Checks if a value is falsy.
-   `t.expect(value).toBe(expected)`: A BDD-style assertion syntax.
-   `t.pass(description)`: Marks a test as passed.
-   `t.fail(description)`: Marks a test as failed.

By following these patterns, you can build a comprehensive and reliable test suite for your Neo.mjs applications, ensuring that both your core logic and your components behave as expected.
