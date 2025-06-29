Neo.mjs is multi-threaded. There are worker threads that handle data access, application logic, and keeping track of DOM updates.
Practically all your application logic is run in parallel in these threads. However, anything that needs to actually
reference or update the DOM (window.document), or just use the window object, must be done in the main application thread.

That's the purpose of main thread addons. These are classes whose methods can be accessed from other web workers,
but are actually executed in the main thread.

For example, what if you needed to read the browser's URL? That information is in window.location.
But window is a main thread variable! To access that from a web-worker our code has to say
"hey main thread, please return a specified window property."
Neo.mjs lets you do that via `Neo.Main.getByPath()`. For example, the following statement logs the URL query string.

```javascript readonly
const search = await Neo.Main.getByPath({path: 'window.location.search'});
console.log(search); // Logs the search string
```

`Neo.Main` & `Neo.main.DomAccess` provide some basic methods for accessing the main thread, but in case you want to use
a third party library which relies on directly working with the DOM, you'd use a main thread addon.

Google Maps is a good example of this. In Neo.mjs, most views are responsible for updating their own vdom, but the
responsibility for rendering maps and markers is handled by Google Maps itself — we ask Google Maps to do certain things
via the Google Maps API. Therefore, in Neo.mjs, Google Maps is implemented as a main thread addon which loads the libraries
and exposes whatever methods we'll need to run from the other Neo.mjs threads. In addition, in a Neo.mjs application we
want to use Google Maps like any other component, so Neo.mjs also provides a component wrapper. In summary:
- The main-thread addon contains the code run in the main thread, and exposes what methods can be run by other web-workers (remote method access)
- The component wrapper lets you use it like any other component, internally calling the main thread methods as needed.

## How it Works: The Round Trip of a Remote Call

When your code in the App Worker calls an addon method, a sophisticated, promise-based communication happens automatically
behind the scenes.

Let's trace the journey of a single call:

```javascript readonly
// Inside a component in the App Worker
async function getMySetting() {
    let data = await Neo.main.addon.LocalStorage.readLocalStorageItem({key: 'my-setting'});
    console.log(data.value);
}
```

Here's what happens when getMySetting() is executed:

// TODO: file does not yet exist
!Main Thread Addon Communication Flow (https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/main-thread-addon-round-trip.png)

1. **The Call (App Worker)**: Your code calls what looks like a normal static method. However, this `readLocalStorageItem`
  function is actually a "proxy" or "stub" created by the framework.
2. **The Message (App Worker -> Main Thread)**: The proxy function immediately returns a `Promise` and sends a message to the
  main thread containing the addon's class name (`Neo.main.addon.LocalStorage`), the method name (`readLocalStorageItem`),
  and the arguments (`{key: 'my-setting'}`).
3. **The Execution (Main Thread)**: The main thread receives the message, finds the `LocalStorage` addon instance, and calls
   the real `readLocalStorageItem` method with the provided arguments.
4. **The Return (Main Thread -> App Worker)**: The method returns the value from `localStorage`. The main thread packages
  this return value into a "reply" message and sends it back to the App Worker.
5. **Promise Resolution (App Worker)**: The App Worker receives the reply and uses it to resolve the Promise from Step 2.
   The `await` is now complete, and the `data` variable receives the value.


This entire round trip is completely managed by the framework. As a developer, you only need to await the result,
just like any other asynchronous function.

## The Anatomy of an Addon: A LocalStorage Example

The easiest way to understand an addon is to look at a simple one.
The LocalStorage addon provides basic CRUD (Create, Read, Update, Delete) operations for the browser's `window.localStorage`.

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

## A Second Example: The Cookie Addon

The framework provides another great example of an addon for interacting with a browser API: the `Cookie` addon.
It provides methods to read and write to document.cookie.


Let's analyze its source code ([src/main/addon/Cookie.mjs](https://github.com/neomjs/neo/blob/dev/src/main/addon/Cookie.mjs)):

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

This addon follows the exact same pattern as the `LocalStorage` addon:

1. It extends `Neo.main.addon.Base`.
2. It defines its `remote` config to expose `getCookie`, `getCookies`, and `setCookie` to the app worker.
3. Its methods (`getCookie`, `setCookie`) directly interact with the document object,
   which is only available on the main thread.

To use it from your application, you would first need to ensure it's instantiated on the main thread
(e.g., in `Main.mjs`), just like the `LocalStorage` example.

Then, from any component in your App Worker, you can call its methods:

```javascript readonly
// Inside a component in the App Worker
async function manageCookies() {
    // Set a cookie
    await Neo.main.addon.Cookie.setCookie("username=JohnDoe; max-age=3600; path=/");

    // Read the cookie
    let user = await Neo.main.addon.Cookie.getCookie("username");
    console.log(user); // "JohnDoe"
}
```

These two examples, `LocalStorage` and `Cookie`, demonstrate a clear and repeatable pattern for creating addons that safely
bridge the gap between the worker and main thread environments.

## Advanced: Lazy Loading with loadFiles()

What if your addon depends on a large, external library (like a charting or mapping library)?
You don't want to load that library until it's actually needed.

The `Neo.main.addon.Base` class has a built-in mechanism for this.

1. Place your library loading logic inside the `async loadFiles()` method in your addon.
2. The base class will automatically delay any remote method calls until `loadFiles()` has completed
  and the addon's `isReady` property is `true`.

Here's a conceptual example:

```javascript readonly
// Inside a hypothetical src/main/addon/ChartingLibrary.mjs
import Base from './Base.mjs';

class ChartingLibrary extends Base {
    static config = {
        className: 'Neo.main.addon.ChartingLibrary',
        remote   : { app: ['createChart'] }
    }

    async loadFiles() {
        // Dynamically load the external charting library script
        await Neo.main.DomAccess.loadScript({
            id : 'charting-lib-script',
            src: 'https://example.com/charting-library.js'
        });
    }

    createChart(opts) {
        // This code will only run after the script has loaded
        // and the addon is ready.
        return window.ExternalChartingLibrary.create(opts.domId, opts.chartConfig);
    }
}

export default Neo.setupClass(ChartingLibrary);
```

When a worker calls `Neo.main.addon.ChartingLibrary.createChart()` for the first time, the `Base` addon class will automatically:
1. Trigger `loadFiles()`.
2. Queue the `createChart` call.
3. Wait for the script to load.
4. Execute the queued `createChart` call.
5. Resolve the `Promise` back in the worker.

All subsequent calls will execute immediately, as the library will already be loaded. This powerful feature ensures optimal
performance by deferring the loading of heavy resources until they are absolutely necessary.
