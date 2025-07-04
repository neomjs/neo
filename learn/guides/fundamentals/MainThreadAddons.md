Neo.mjs is multi-threaded. There are worker threads that handle data access, application logic, and
keeping track of DOM updates. Practically all your application logic is run in parallel in these
threads. However, anything that needs to actually reference or update the DOM (`window.document`),
or just use the `window` object, must be done in the main application thread.

That's the purpose of main thread addons. These are classes whose methods can be accessed from other
web workers, but are actually executed in the main thread.

For example, what if you needed to read the browser's URL? That information is in `window.location`.
But `window` is a main thread variable! To access that from a web-worker our code has to say "hey
main thread, please return a specified `window` property." Neo.mjs lets you do that via
`Neo.Main.getByPath()`. For example, the following statement logs the URL query string.

```javascript readonly
const search = await Neo.Main.getByPath({path: 'window.location.search'});
console.log(search); // Logs the search string
```

`Neo.Main` & `Neo.main.DomAccess` provide some basic methods for accessing the main thread, but in
case you want to use a third party library which relies on directly working with the DOM, you'd use
a main thread addon.

Google Maps is a good example of this. In Neo.mjs, most views are responsible for updating their own
vdom, but the responsibility for rendering maps and markers is handled by Google Maps itself — we
_ask_ Google Maps to do certain things via the Google Maps API. Therefore, in Neo.mjs, Google Maps
is implemented as a main thread addon which loads the libraries and exposes whatever methods we'll
need to run from the other Neo.mjs threads. In addition, in a Neo.mjs application we want to use
Google Maps like any other component, so Neo.mjs also provides a component wrapper. In summary:
- The main-thread addon contains the code run in the main thread, and exposes what methods can be
  run by other web-workers (remote method access)
- The component wrapper lets you use it like any other component, internally calling the main thread
  methods as needed.

## How it Works: The Round Trip of a Remote Call

When your code in the App Worker calls an addon method, a sophisticated, promise-based communication
happens automatically behind the scenes.

Let's trace the journey of a single call:

```javascript readonly
// Inside a component in the App Worker
async function getMySetting() {
    let data = await Neo.main.addon.LocalStorage.readLocalStorageItem({key: 'my-setting'});
    console.log(data.value);
}
```

Here's what happens when `getMySetting()` is executed:

```text
+------------------------------------------------+         +------------------------------------------------+
|                   App Worker                   |         |                   Main Thread                  |
+------------------------------------------------+         +------------------------------------------------+
|                                                |         |                                                |
| 1. Your code calls a proxy method.             |         |                                                |
|    e.g., `addon.readLocalStorageItem()`        |         |                                                |
|                                                |         |                                                |
|    This immediately returns a `Promise`.       |         |                                                |
|                                                |         |                                                |
|------------------------------------------------|         |                                                |
|                                                |         |                                                |
| 2. A message is sent to the Main Thread        | ---->   | 3. The message is received. The framework      |
|    containing the target & arguments.          |         |    finds the addon instance and calls the      |
|                                                |         |    *real* method with the arguments.           |
|                                                |         |                                                |
|------------------------------------------------|         |------------------------------------------------|
|                                                |         |                                                |
| 5. The Promise from Step 1 is resolved with    | <----   | 4. The method returns a value. The framework   |
|    the value from the reply message.           |         |    packages this value in a reply message      |
|                                                |         |    and sends it back to the App Worker.        |
|    The `await` keyword gets the final value.   |         |                                                |
|                                                |         |                                                |
+------------------------------------------------+         +------------------------------------------------+
```

1.  **The Call (App Worker)**: Your code calls what looks like a normal static method. However, this
    `readLocalStorageItem` function is actually a "proxy" or "stub" created by the framework.
2.  **The Message (App Worker -> Main Thread)**: The proxy function immediately returns a `Promise`
    and sends a message to the main thread containing the addon's class name
    (`Neo.main.addon.LocalStorage`), the method name (`readLocalStorageItem`), and the arguments
    (`{key: 'my-setting'}`).
3.  **The Execution (Main Thread)**: The main thread receives the message, finds the `LocalStorage`
    addon instance, and calls the real `readLocalStorageItem` method with the provided arguments.
4.  **The Return (Main Thread -> App Worker)**: The method returns the value from `localStorage`. The
    main thread packages this return value into a "reply" message and sends it back to the App
    Worker.
5.  **Promise Resolution (App Worker)**: The App Worker receives the reply and uses it to resolve the
    Promise from Step 2. The `await` is now complete, and the `data` variable receives the value.

This entire round trip is completely managed by the framework. As a developer, you only need to
`await` the result, just like any other asynchronous function.

## Anatomy of an Addon: `LocalStorage` and `Cookie` Examples

Addons are standard Neo.mjs classes that extend `Neo.main.addon.Base`. They define their public API
through the `remote` config.

### The `LocalStorage` Addon

The `LocalStorage` addon provides basic CRUD (Create, Read, Update, Delete) operations for the
browser's `window.localStorage`.

Let's look at its source code
([src/main/addon/LocalStorage.mjs](https://github.com/neomjs/neo/blob/dev/src/main/addon/LocalStorage.mjs)):

```javascript readonly
import Base from './Base.mjs';

/**
  * Basic CRUD support for window.localStorage
  * @class Neo.main.addon.LocalStorage
  * @extends Neo.main.addon.Base
  */
class LocalStorage extends Base {
    static config = {
        className: 'Neo.main.addon.LocalStorage',
        remote: {
            app: [
                'createLocalStorageItem',
                'destroyLocalStorageItem',
                'readLocalStorageItem',
                'updateLocalStorageItem'
            ]
        }
    }

    readLocalStorageItem(opts) {
        return {
            key  : opts.key,
            value: window.localStorage.getItem(opts.key)
        }
    }

    updateLocalStorageItem(opts) {
        window.localStorage.setItem(opts.key, opts.value)
    }
    // ... other methods
}

export default Neo.setupClass(LocalStorage);
```

### The `Cookie` Addon

The framework provides another great example of an addon for interacting with a browser API: the
`Cookie` addon. It provides methods to read and write to `document.cookie`.

Let's analyze its source code
([src/main/addon/Cookie.mjs](https://github.com/neomjs/neo/blob/dev/src/main/addon/Cookie.mjs)):

```javascript readonly
import Base from './Base.mjs';

class Cookie extends Base {
    static config = {
        className: 'Neo.main.addon.Cookie',
        remote: {
            app: [
                'getCookie',
                'getCookies',
                'setCookie'
            ]
        }
    }

    getCookie(name) {
        let {cookie} = document
            .split('; ')
            .find(row => row.startsWith(name));

        return cookie ? cookie.split('=')[1] : null
    }

    setCookie(value) {
        document.cookie = value
    }
    // ...
}

export default Neo.setupClass(Cookie);
```

Both addons follow the same pattern:
1.  They extend `Neo.main.addon.Base`.
2.  They define their `remote` config to expose methods to the `app` worker.
3.  Their methods directly interact with browser-specific APIs (`window.localStorage`,
    `document.cookie`) that are only available on the main thread.

## Managing Addons: The Full Lifecycle

There are two primary ways to bring an addon to life within your application, each serving
different needs.

### A. Eager Loading: The Standard Approach

For addons that are essential for your application's initial operation (e.g., `LocalStorage`,
`Stylesheet`), they are typically instantiated at application startup.

1.  **Configuration:** You can specify addons in your application's `neo-config.json` file.
2.  **Instantiation:** `src/Main.mjs` (the main thread's entry point) is responsible for
    instantiating these configured addons when the application starts. This ensures they are ready
    for use as soon as possible.

### B. Lazy Loading: The Performance-Oriented Approach

For addons that are not needed immediately at startup, or for features that are only used
conditionally, you can lazy-load them on demand. This improves initial application load performance.

You can use `Neo.worker.App.getAddon()` to dynamically load and instantiate an addon:

```javascript readonly
// Example: Only load a complex charting addon when a user clicks a button
async function showChart() {
    // getAddon will ensure the addon is instantiated and ready
    const chartingAddon = await Neo.worker.App.getAddon('Neo.main.addon.ChartingLibrary');
    chartingAddon.createChart({ /* ... config ... */ });
}
```

### C. The "Semi-Singleton" Design: Why Addons are Extensible

Addons *behave* like singletons within the main thread (meaning there's typically only one instance
of a given addon class). However, they are deliberately *not defined* with `singleton: true` in
their `static config`. This is a crucial architectural decision that enables powerful extensibility:

*   **Customization:** Developers can extend a framework addon (e.g., `class MyLocalStorage extends
    Neo.main.addon.LocalStorage`), override its methods, and then configure their `neo-config.json`
    to load *their* custom version.
*   **Flexibility:** If the base class were a true singleton, this kind of runtime extension and
    override would be impossible. By making them "semi-singletons" that `Main.mjs` or
    `Neo.worker.App.getAddon()` manages as single instances, the framework provides both the
    convenience of a singleton and the power of class-based extension.

### Example: Customizing `LocalStorage`

Let's say you want to add a custom prefix to all keys stored in `localStorage` for your application.
You can extend the `Neo.main.addon.LocalStorage` and override its `readLocalStorageItem` and
`updateLocalStorageItem` methods.

First, create your custom addon (e.g., `workspace/src/addon/CustomLocalStorage.mjs`):

```javascript readonly
// workspace/src/addon/CustomLocalStorage.mjs
import LocalStorage from '../../../node_modules/neo.mjs/src/main/addon/LocalStorage.mjs';

class CustomLocalStorage extends LocalStorage {
    static config = {
        className: 'MyApp.main.addon.CustomLocalStorage',
        // This is optional, Neo.Main will always convert main thread addons into singletons.
        // If you want to keep your class open to further extensions, you can use the "semi-singleton" pattern too.
        singleton: true,
        // No need to redefine remote config, it's inherited
    }

    readLocalStorageItem(opts) {
        opts.key = 'myApp_' + opts.key; // Add your custom prefix
        return super.readLocalStorageItem(opts);
    }

    updateLocalStorageItem(opts) {
        opts.key = 'myApp_' + opts.key; // Add your custom prefix
        super.updateLocalStorageItem(opts);
    }
}

export default Neo.setupClass(CustomLocalStorage);
```

Next, configure your `neo-config.json` to use your custom addon instead of the framework's default.
This is done by mapping your custom class to the framework's original class name using the `WS/` prefix.
The `WS/` prefix (which stands for "workspace") tells the framework to look for your addon within the `src/main/addon`
directory of your workspace (the output of `npx neo-app`).

[Side Note]: If you add a new addon to the framework repo, the `WS/` prefix is not needed.

```json
// neo-config.json
{
    "mainThreadAddons": [
        // ...
        "WS/CustomLocalStorage"
    ]
}
```

Now, any call to `Neo.main.addon.CustomLocalStorage.readLocalStorageItem()` or `updateLocalStorageItem()`
from your app worker will actually be routed to your `CustomLocalStorage` instance on the main thread,
automatically applying your custom key prefix. This demonstrates how easily you can swap out or extend
framework-provided functionality with your own custom implementations.

## Asynchronous Initialization: `initAsync` and the `isReady` config

The multi-threaded nature of Neo.mjs introduces a subtle but important challenge: ensuring that an
addon is fully initialized and its environment is ready before it's used. This is solved by the
`initAsync` lifecycle method and the `isReady` config, managed by `Neo.core.Base`.

### The Problem: A Race Condition

Consider a scenario where a Main thread addon needs to register itself with another core framework
service (like `Neo.worker.Manager` or `Neo.manager.Instance`). These services are also instantiated
on the Main thread. If the addon's `initAsync()` (or any logic called from it) tries to interact
with such a service *during* that service's synchronous construction phase, it might try to access
properties or methods before they are fully initialized, leading to a race condition.

### The Solution: Microtasks and `isReady`

`Neo.core.Base` addresses this by scheduling the `initAsync()` method in the JavaScript microtask
queue.

1.  **Synchronous Construction Completes:** The entire synchronous `construct()` method of a class
    (including the worker's `construct()` that sets `Neo.currentWorker`) runs to completion first.
2.  **`initAsync()` Executes:** Only *after* the current synchronous block finishes, the microtask
    queue is processed, and `initAsync()` is called on all newly created instances.
3.  **`isReady` Signal:** Once `initAsync()` (and any `await`ed operations within it, like
    `loadFiles()`) completes, the addon's `isReady` flag is set to `true`. This is the definitive
    signal that the addon is fully initialized and safe to interact with.
4. **`afterSetIsReady()`:** If needed, you can listen to changes of the `isReady` config value,
  using the provided hook.

### The `cacheMethodCall()` Safety Net

The `Neo.main.addon.Base` class provides a crucial utility, `cacheMethodCall()`, for managing remote
method calls that arrive before an addon is fully `isReady`. Thanks to a generic interception
mechanism in `Neo.worker.mixin.RemoteMethodAccess`, if a remote call for a method listed in the
addon's `interceptRemotes` config arrives while `isReady` is `false`, the call is automatically
queued. Once `isReady` becomes `true`, all cached calls are processed in order.

Here's how `onInterceptRemotes()` in `Neo.main.addon.Base` handles this:

```javascript readonly
onInterceptRemotes(msg) {
    return this.cacheMethodCall({fn: msg.remoteMethod, data: msg.data})
}
```

This significantly simplifies addon development by centralizing the queuing logic.

## The Component Wrapper Pattern: Putting It All Together

While you can call addon methods directly (e.g.,
`await Neo.main.addon.LocalStorage.readLocalStorageItem()`), the best practice for integrating
addons into your application's UI is to create a **component wrapper**.

A component wrapper is a standard Neo.mjs component (running in the App Worker) that encapsulates
the interaction with a main thread addon. It exposes a clean, declarative API to your application,
while internally handling the remote method calls to the addon.

The `Neo.component.wrapper.MonacoEditor` is a perfect real-world example of this pattern.

### Case Study: `Neo.component.wrapper.MonacoEditor`

The `MonacoEditor` component allows you to embed the powerful Monaco Editor (the code editor from VS
Code) into your Neo.mjs application. The Monaco Editor itself is a large, DOM-heavy library that
*must* run on the main thread.

Here's how the `MonacoEditor` component acts as a wrapper:

1.  **Encapsulation:** The component's `static config` exposes properties like `value`, `language`,
    `readOnly`, and `editorTheme`. These are the properties a developer interacts with, not the
    low-level Monaco Editor options.
2.  **Remote Method Calls:** Internally, the component's `afterSet` methods (e.g., `afterSetValue`,
    `afterSetLanguage`) don't directly manipulate the editor. Instead, they make remote calls to the
    `MonacoEditor` addon on the main thread:

    ```javascript readonly
    // Inside Neo.component.wrapper.MonacoEditor.mjs
    afterSetValue(value, oldValue) {
        let me = this;
        if (me.mounted) { // Defensive check, though addon.Base handles queuing
            Neo.main.addon.MonacoEditor.setValue({
                id      : me.id,
                value   : me.stringifyValue(me.value),
                windowId: me.windowId
            })
        }
    }
    ```
3.  **Lifecycle Management:** The wrapper component also manages the addon's lifecycle from the
    worker's perspective. For example, when the component is `mounted` (meaning its DOM element is
    in the document), it tells the addon to create the editor instance:

    ```javascript readonly
    // Inside Neo.component.wrapper.MonacoEditor.mjs
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        let me = this;
        value && me.timeout(150).then(() => {
            // This call will trigger the addon to create the Monaco Editor instance on the main thread
            Neo.main.addon.MonacoEditor.createInstance(me.getInitialOptions()).then(() => {
                me.onEditorMounted?.()
            })
        })
    }
    ```
4.  **Cleanup:** When the component is destroyed, it tells the addon to destroy the corresponding
    editor instance on the main thread, preventing memory leaks.

This pattern ensures that your application code remains clean, declarative, and runs entirely within
the App Worker, while the complexities of main thread interaction are neatly encapsulated within the
component wrapper and its associated addon.

## Advanced: Lazy Loading External Libraries with `loadFiles()`

For addons that depend on large, external JavaScript libraries (like a charting or mapping library),
you don't want to load that library until it's actually needed. The `Neo.main.addon.Base` class
provides a powerful mechanism for this: the `async loadFiles()` method.

1.  **Implement `loadFiles()`:** Place your library loading logic (e.g., dynamically injecting a
    `<script>` tag) inside the `async loadFiles()` method in your addon. This method **must** return
    a `Promise` that resolves when the library is fully loaded and ready.
2.  **Automatic Queuing via `interceptRemotes`:** For methods listed in an addon's `interceptRemotes`
    config, the framework automatically handles queuing any remote method calls that arrive before
    the addon's `isReady` property is `true`.

Here's a conceptual example:

```javascript readonly
// Inside a hypothetical src/main/addon/ChartingLibrary.mjs
import Base from './Base.mjs';

class ChartingLibrary extends Base {
    static config = {
        className       : 'Neo.main.addon.ChartingLibrary',
        interceptRemotes: ['createChart'],         // List methods to be automatically queued
        remote          : { app: ['createChart'] } // Exposes `createChart` as a remote method to the app worker
    }

    async loadFiles() {
        // Dynamically load the external charting library script
        await Neo.main.DomAccess.loadScript({
            id : 'charting-lib-script',
            src: 'https://example.com/charting-library.js'
        });
        // You might also need to wait for the library to initialize itself
        // await new Promise(resolve => window.ExternalChartingLibrary.onReady(resolve));
    }

    createChart(opts) {
        // This code will only run after the script has loaded
        // and the addon is ready. The framework handles queuing automatically.
        return window.ExternalChartingLibrary.create(opts.domId, opts.chartConfig);
    }
}
```

When a worker calls `Neo.main.addon.ChartingLibrary.createChart()` for the first time:
1.  The framework intercepts the call because `createChart` is in `interceptRemotes`.
2.  If the addon is not `isReady`, the call is automatically queued.
3.  `loadFiles()` is triggered (if not already running).
4.  Once `loadFiles()` resolves and the addon becomes `isReady`, the queued `createChart` call is
    executed.
5.  The `Promise` back in the worker is resolved.

All subsequent calls will execute immediately, as the library will already be loaded. This powerful
feature ensures optimal performance by deferring the loading of heavy resources until they are
absolutely necessary.

## Conclusion: Empowering Your Application with Main Thread Addons

Main Thread Addons are a cornerstone of Neo.mjs's multi-threaded architecture, providing a robust and
elegant solution for interacting with browser-specific APIs and third-party libraries. By offloading
these tasks to the main thread while keeping your core application logic in workers, Neo.mjs ensures
unparalleled responsiveness and performance.

This guide has explored the full lifecycle of addons, from their "semi-singleton" design that promotes
extensibility, to the sophisticated `initAsync` and `isReady` mechanisms that guarantee safe,
asynchronous initialization. You've seen how the framework seamlessly handles remote method calls,
queuing them when necessary, and how the component wrapper pattern provides a clean, declarative
interface for your application.

By leveraging Main Thread Addons, you can confidently integrate any browser-dependent functionality
into your Neo.mjs application, knowing that the framework is handling the complex inter-thread
communication and lifecycle management for you. This powerful pattern is key to building
high-performance, extensible, and truly modern web applications.
