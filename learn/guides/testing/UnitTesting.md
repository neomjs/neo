# Unit Testing with Playwright

Neo.mjs uses a unique "Single-Thread Simulation" architecture for its unit tests. By running the core framework logic inside a single Node.js thread (via Playwright), we can test complex multi-threaded interactions without the complexity or overhead of real browser workers.

## Why Unit Test This Way?

1.  **Speed**: Logic tests run instantly in Node.js, bypassing browser rendering and worker thread startup costs.
2.  **Simplified Debugging**: Since the App, VDom, and Data layers run in the same scope, you can step through code execution across "workers" without context switching.
3.  **Stability**: Removing the asynchronous nature of `postMessage` for testing allows us to deterministically test race conditions and state management logic.

## Running Unit Tests

To run the logic-heavy unit tests in the simulated Node.js environment:

```bash
npm run test-unit
```

## Developer Workflow (Best Practices)

### 1. Running a Single File (Focus Mode)
During development, you don't want to wait for the entire suite. You can run a specific test file using `npx playwright`.

**Critical:** You **MUST** specify the unit test config (`-c test/playwright/playwright.config.unit.mjs`). If you don't, Playwright will default to the generic config and fail to load the environment correctly.

```bash
# Correct way to run a single unit test file
npx playwright test test/playwright/unit/my/file.spec.mjs -c test/playwright/playwright.config.unit.mjs
```

### 2. Debugging
To step through your tests visually or pause execution:
```bash
# Opens the Playwright Inspector
npx playwright test test/playwright/unit/my/file.spec.mjs -c test/playwright/playwright.config.unit.mjs --debug
```

To filter tests by name (e.g., only run tests with "sort" in the title):
```bash
npx playwright test -c test/playwright/playwright.config.unit.mjs -g "sort"
```

### 3. The "Safety Net" (Cross-Test Side Effects)
**Warning:** Playwright distributes test files across multiple **Node.js worker processes** to run them in parallel. However, within a *single* Playwright worker process, the environment (and the global `Neo` namespace) persists across multiple test files.

*   **The Risk:** We do *not* clean up the `Neo` namespace between tests (doing so would be slow). If Test File A defines a class `Test.MockComponent` and Test File B tries to define the same class with different behavior, `Neo.setupClass` will throw a "Namespace Collision" error.
*   **The Strategy:** Ensure every test class has a **unique namespace**, ideally scoped to the test file (e.g., `Test.Unit.MyFeature.MockComponent`).
*   **The Rule:** Even if your specific test file passes, you **MUST** run the full suite (`npm run test-unit`) before committing. This verifies that your new namespaces don't accidentally collide with existing ones when Playwright groups them together.

## Unit Testing Architecture

The unit tests located in `test/playwright/unit/` are the backbone of our testing strategy. They run in a **Node.js environment**, effectively simulating the Neo.mjs App Worker (and parts of the VDom/Data workers) within a single thread.

This architecture allows us to test core logic, state management, and VDOM diffing at extreme speeds, but it requires a specific import strategy to manually "assemble" the framework's parts that are usually distributed across workers.

### The "Single Thread" Simulation

In a real Neo.mjs app, `Neo.vdom.Helper` lives in the VDom Worker, and `Neo.component.Base` lives in the App Worker. They communicate via `postMessage`.

In a Unit Test:
1.  There are no workers.
2.  We import **both** the App Worker classes and the VDom Worker classes into the same Node.js scope.
3.  The `setup()` function mocks the messaging layer, allowing them to talk directly.

### Understanding Imports (Critical)

Because we are bypassing the standard build/worker loading process, you must manually import the dependencies your test needs.

#### 1. The Core Augmentation (`core/_export.mjs`)
**Rule:** You must almost ALWAYS import `src/core/_export.mjs`.

```javascript
import Neo       from '../../../../src/Neo.mjs';
import * as core from '../../../../src/core/_export.mjs'; // REQUIRED
```

**Why?** `Neo.mjs` is the bare namespace root. While it contains the class system logic (like `Neo.create`), it does **not** include many global utility methods that the framework relies on.
For example, **`Neo.isString`** is defined in `src/core/Util.mjs` and **`Neo.isEqual`** is defined in `src/core/Compare.mjs`. If you do not import `core/_export.mjs`, these methods will be undefined, causing failures in config setters and type checking.

#### 2. The VDOM Engine (`VdomHelper` + Renderer)
**Rule:** If you are testing a **Component** or anything that generates VDOM, you must import the Helper and a Renderer.

```javascript
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
```

**Why?**
*   **`VdomHelper`**: In a real app, this is in the VDom Worker. In a unit test, we need it locally to calculate deltas (`.vdom` vs `.vnode`).
*   **`DomApiVnodeCreator`**: This is the renderer. It takes the VDOM and generates the "VNode" structure (simulating the DOM).
    *   Use `DomApiVnodeCreator` if you want to simulate DOM-like behavior (the default modern mode).
    *   Use `StringFromVnode` if you are testing raw HTML string generation (legacy/SSG mode).

### Namespace Isolation & Collisions (CRITICAL)

**The Problem:**
Playwright runs unit tests in worker processes. To optimize performance, it may reuse the same worker process for multiple test files. Since Neo.mjs creates **global namespaces** (e.g., `Neo.button.Base` is available globally), definitions from one test file can persist and pollute the environment of subsequent tests running in the same worker.

**The Guardrail:**
To prevent silent failures or weird side effects, `Neo.setupClass` has a strict check when `Neo.config.unitTestMode` is `true`. It will **THROW AN ERROR** if you attempt to define a class with a `className` that already exists.

**The Rules:**
1.  **Unique ClassNames**: Every test class you define MUST have a `className` that is unique across the **entire test suite**.
    *   ❌ `className: 'Test.MockComponent'` (Too generic, will collide)
    *   ✅ `className: 'Test.Unit.Vdom.MyFeature.MockComponent'` (Specific to the file/feature)
2.  **Avoid `ntype`**: Do not define an `ntype` for test components unless you specifically need to test `Neo.create({ntype: ...})`.
    *   `ntype`s are also global and unique. A collision will throw an error.
    *   Prefer instantiation via module: `Neo.create(MyTestClass, ...)` instead of `Neo.create({ntype: 'my-test-class', ...})`.

### Anatomy of a Component Unit Test

Here is the complete, correct pattern for testing a Component:

```javascript
import {setup} from '../../setup.mjs';

const appName = 'MyButtonTest';

// 1. Setup Phase: Configure the "Simulated Worker"
setup({
    neoConfig: {
        allowVdomUpdatesInTests: true, // Enable VDOM engine
        unitTestMode           : true, // Enable test guardrails
        useDomApiRenderer      : true  // Use the modern object-based renderer
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true, // Mock "Main Thread" mounted state
        vnodeInitialising: false
    }
});

// 2. Imports Phase: Assemble the Framework
import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs'; // <--- AUGMENT NEO NAMESPACE
import Button             from '../../../../src/button/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs'; // <--- RENDERER
import VdomHelper         from '../../../../src/vdom/Helper.mjs'; // <--- ENGINE

test.describe('Neo.button.Base', () => {

    test('should generate correct VDOM deltas', async () => {
        // 3. Create Instance
        const button = Neo.create(Button, {
            appName,
            iconCls: 'fa fa-home',
            text   : 'Home'
        });

        // 4. Initial Render (Manually trigger VDOM generation)
        const { vnode } = await button.initVnode();
        
        // Assert Initial State
        expect(vnode.nodeName).toBe('button');
        expect(vnode.childNodes[1].textContent).toBe('Home');

        // 5. Simulate Mounting
        // We must tell the instance it is "mounted" so subsequent updates trigger the VDOM engine
        button.mounted = true; 

        // 6. Test Reactivity (Update Config)
        const { deltas } = await button.set({text: 'Welcome'});

        // Assert Delta Update
        expect(deltas.length).toBe(1);
        expect(deltas[0].textContent).toBe('Welcome');

        button.destroy();
    });
});
```

### Test Lifecycle Management

In unit tests, we are responsible for the entire lifecycle of the components we create. Since the `Neo` namespace persists across tests in the same worker, failing to destroy components can lead to ID collisions and memory leaks.

Use `test.beforeEach` and `test.afterEach` to manage this cleanly:

```javascript
// test/playwright/unit/functional/Button.spec.mjs
test.describe('functional/Button', () => {
    let button, vnode;
    let testRun = 0;

    // 1. Setup: Runs before EVERY test case
    test.beforeEach(async () => {
        testRun++;
        // Create a fresh instance for each test
        button = Neo.create(Button, {
            appName,
            // Ensure unique ID per test run to avoid collisions
            id     : 'my-button-' + testRun, 
            iconCls: 'fa fa-home',
            text   : 'Click me'
        });

        ({vnode} = await button.initVnode());
        button.mounted = true;
    });

    // 2. Teardown: Runs after EVERY test case (pass or fail)
    test.afterEach(() => {
        // Critical: Destroy the instance to clean up the ComponentManager
        button?.destroy();
        button = null;
        vnode  = null;
    });

    test('should create initial vnode correctly', async () => {
        expect(vnode.nodeName).toBe('button');
    });
});
```

### Common Testing Patterns

Our unit test suite contains over **250 tests** covering many core aspects of the **Neo.mjs Application Engine**. This includes the Config System, Core Logic, VDOM diffing, and State Management. Here are some common patterns you will encounter.

#### 1. Logic & State (No VDOM)
You can test complex state management logic without any rendering overhead. This is ideal for Stores, State Providers, and logical Controllers.

```javascript
// test/playwright/unit/state/Provider.spec.mjs
test('Provider should update data and trigger config changes', () => {
    // 1. Create a component with a State Provider
    const component = Neo.create(MockComponent, {
        stateProvider: {data: {counter: 0}}
    });
    
    // 2. Create a binding (simulates a view binding)
    let effectRunCount = 0;
    component.getStateProvider().createBinding(component.id, 'testConfig', data => {
        effectRunCount++;
        return data.counter;
    });

    // 3. Verify Initial State
    expect(component.testConfig).toBe(0);

    // 4. Modify State
    component.setState('counter', 1);

    // 5. Verify Reactivity
    expect(effectRunCount).toBe(2);
    expect(component.testConfig).toBe(1);

    component.destroy();
});
```

#### 2. Async & Lifecycle
Neo.mjs has built-in mechanisms to handle async operations safely (e.g., cancelling promises when a component is destroyed). Unit tests verify this behavior.

```javascript
// test/playwright/unit/core/AsyncDestruction.spec.mjs
test('core.Base.trap() should reject with Neo.isDestroyed when destroyed', async () => {
    const instance = Neo.create(TestClass);

    // 1. Create a never-resolving promise
    let slowPromiseResolve;
    const slowPromise = new Promise(resolve => { slowPromiseResolve = resolve });

    // 2. Wrap it in the trap() method
    const trapped = instance.trap(slowPromise);

    // 3. Destroy the instance while promise is pending
    instance.destroy();

    // 4. Verify it rejects with the specific symbol
    try {
        await trapped;
    } catch (e) {
        expect(e).toBe(Neo.isDestroyed);
    }
});
```

#### 3. Reactivity & Effects
You can verify the fine-grained reactivity system, ensuring that dependencies are tracked correctly and updates are batched for performance.

```javascript
// test/playwright/unit/core/EffectBatching.spec.mjs
test('Effects should be batched during core.Base#set() operations', () => {
    const instance = Neo.create(TestClass);
    let effectRunCount = 0;

    // 1. Create an effect tracking multiple properties
    new Neo.core.Effect(() => {
        effectRunCount++;
        // Accessing properties registers them as dependencies
        const sum = instance.configA + instance.configB;
    });

    // 2. Reset count
    effectRunCount = 0;

    // 3. Update multiple configs in one batch
    instance.set({
        configA: 1,
        configB: 2
    });

    // 4. Verify the effect ran ONLY ONCE despite two changes
    expect(effectRunCount).toBe(1);
    
    instance.destroy();
});
```

#### 4. Class System & Mixins
The unit test suite validates the core class system, including config merging strategies and mixin application.

```javascript
// test/playwright/unit/neo/MixinStaticConfig.spec.mjs
test('A class config should always win over a mixin config', () => {
    // 1. Define Mixin with default config
    class Mixin extends Neo.core.Base {
        static config = {
            className: 'TestMixin',
            myConfig_: 'mixinValue'
        }
    }
    Mixin = Neo.setupClass(Mixin);

    // 2. Define Class using Mixin but overriding config
    class MyClass extends Neo.core.Base {
        static config = {
            className: 'MyClass',
            mixins   : [Mixin],
            myConfig_: 'classValue'
        }
    }
    MyClass = Neo.setupClass(MyClass);

    // 3. Verify Class Precedence
    const instance = Neo.create(MyClass);
    expect(instance.myConfig).toBe('classValue');
});
```

#### 5. Complex VDOM Logic (Race Conditions)
We can simulate complex race conditions to ensure VDOM integrity under load.

```javascript
// test/playwright/unit/tree/ListRaceCondition.spec.mjs
test('expandParents followed by store update should not break VDOM', async () => {
    const tree = Neo.create(TreeList, { /* ... */ });
    await tree.initVnode();

    // 1. Trigger VDOM manipulation (Expand)
    tree.expandParents('child1');

    // 2. Simulate conflicting Store update
    tree.store.fire('recordChange', { /* ... */ });

    // 3. Wait for async settlement
    await tree.timeout(50);

    // 4. Verify VDOM structure is still valid
    const folderNode = tree.getVdomChild('folder1');
    expect(folderNode.tag).toBe('li'); // Should not have morphed into 'ul'
    
    tree.destroy();
});
```

## Directory Structure

*   `test/playwright/unit/`: Logic tests running in Node.js (App Worker + VDom Worker logic simulation).
*   `test/playwright/setup.mjs`: The test environment bootstrapper.

## Next Steps

This guide covers Unit Testing. For information on **Component Testing** (running tests in a real browser environment to test DOM events and layout), please refer to the [Component Testing Guide](ComponentTesting.md).
