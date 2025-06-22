# Neo.mjs Application Bootstrap Process

This guide explains how Neo.mjs applications start, initialize, and come to life - from the initial HTML file to your first rendered component.

## Overview

When you run a Neo.mjs application in the browser, a sophisticated multi-threaded orchestration happens behind the scenes. Unlike traditional web frameworks that run everything on the main thread, Neo.mjs distributes work across multiple threads using Web Workers.

> **Note:** For a deeper understanding of Neo.mjs's multi-threaded architecture, see the [Off The Main Thread](../benefits/OffTheMainThread.md) guide.

## Bootstrap Sequence

### 1. Entry Point: index.html

The bootstrap process begins with a minimal HTML file:

```html
<!DOCTYPE HTML>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta charset="UTF-8">
    <title>My Neo.mjs App</title>
</head>
<body>
    <script src="../../src/MicroLoader.mjs" type="module"></script>
</body>
</html>
```

The only JavaScript file imported is the `MicroLoader.mjs`, which is loaded as an ES module.

> **Note:** You don't need to create these files manually. Neo.mjs provides CLI tools to generate the basic application structure. You can use `npm run create-app` inside the framework repo or `npx neo-app` to generate a workspace with the same structure.

### 2. MicroLoader: Configuration Loading

The `MicroLoader.mjs` is a small script that fetches the application configuration and bootstraps the main thread:

```javascript
fetch('./neo-config.json').then(r => r.json()).then(d => {
    globalThis.Neo = {config: {...d}};
    import(d.mainPath)
})
```

It performs these steps:
1. Fetches the `neo-config.json` file from the current directory
2. Parses the JSON response
3. Creates a global `Neo` object with the `config` property set to the parsed JSON
4. Dynamically imports the module specified by the `mainPath` property from the config

### 3. Configuration: neo-config.json

The `neo-config.json` file contains essential configuration for the application bootstrap. For a complete overview of all available configuration options, you can refer to the `src/DefaultConfig.mjs` file in the Neo.mjs framework:

```json
{
    "appPath": "apps/myapp/app.mjs",
    "basePath": "../../",
    "environment": "development",
    "mainPath": "./Main.mjs",
    "workerBasePath": "../../src/worker/",
    "useSharedWorkers": false,
    "useVdomWorker": true,
    "useDataWorker": false,
    "useCanvasWorker": false,
    "useTaskWorker": false,
    "useServiceWorker": false,
    "themes": ["neo-theme-light"],
    "mainThreadAddons": ["Stylesheet"]
}
```

**Key Configuration Properties:**
- **`appPath`** - Points to your application's entry point (app.mjs)
- **`basePath`** - Root path for resolving other paths
- **`environment`** - Controls optimization and debugging features
- **`mainPath`** - Framework's main thread bootstrap file
- **`workerBasePath`** - Location of worker initialization files
- **`useSharedWorkers`** - When set to true, ALL workers (App, VDom, Data, etc.) will be created as SharedWorkers, enabling multi-window applications. When false, all workers will be dedicated workers (better for single-page applications). The `worker.Base` class provides an abstraction layer that supports both types with a consistent API, allowing developers to create an app with dedicated workers first (which are easier to debug) and then switch to shared workers with just a one-line configuration change.
- **`useVdomWorker`** - Controls whether to use a separate worker for virtual DOM operations
- **`useDataWorker`** - Controls whether to use a separate worker for data operations
- **`useCanvasWorker`** - Controls whether to use a separate worker for canvas operations
- **`useTaskWorker`** - Controls whether to use a separate worker for background tasks
- **`useServiceWorker`** - Controls whether to use a service worker for caching
- **`themes`** - CSS themes to load
- **`mainThreadAddons`** - Additional features to load in the main thread

**Configuration Categories:**
- **Path Resolution** - Where to find files and modules
- **Worker Settings** - Which workers to use and how they should be configured
- **Theme Management** - CSS themes to load
- **Addon Loading** - Additional main thread features to load

### 4. Main Thread Initialization

The MicroLoader imports `Main.mjs`, which initializes the main thread:

```javascript
import Neo           from './Neo.mjs';
import * as core     from './core/_export.mjs';
import DomAccess     from './main/DomAccess.mjs';
import DeltaUpdates  from './main/DeltaUpdates.mjs';
import DomEvents     from './main/DomEvents.mjs';
import Observable    from './core/Observable.mjs';
import WorkerManager from './worker/Manager.mjs';

class Main extends core.Base {
    // ...

    construct(config) {
        super.construct(config);

        let me = this;

        WorkerManager.on({
            'automount'        : me.onRender,
            'message:mountDom' : me.onMountDom,
            'message:updateDom': me.onUpdateDom,
            'updateVdom'       : me.onUpdateVdom,
            scope              : me
        });

        DomEvents.on('domContentLoaded', me.onDomContentLoaded, me);

        if (document.readyState !== 'loading') {
            DomEvents.onDomContentLoaded()
        }
    }

    // ...
}
```

The Main class:
1. Imports the WorkerManager and other core modules
2. Sets up event listeners for worker messages
3. Listens for the 'domContentLoaded' event
4. When the DOM is loaded, it loads any main thread addons and notifies the WorkerManager

### 5. Worker Manager: Creating Workers

The `WorkerManager` is responsible for creating and managing the workers:

```javascript
class Manager extends Base {
    // ...

    createWorkers() {
        let me                   = this,
            config               = Neo.clone(NeoConfig, true),
            {hash, href, search} = location,
            {windowId}           = me,
            key, value;

        // Configure the workers
        // ...

        for ([key, value] of Object.entries(me.workers)) {
            if (key === 'canvas' && !config.useCanvasWorker ||
                key === 'task'   && !config.useTaskWorker   ||
                key === 'vdom'   && !config.useVdomWorker
            ) {
                continue
            }

            try {
                value.worker = me.createWorker(value)
            } catch (e) {
                document.body.innerHTML = e;
                me.stopCommunication = true;
                break
            }

            me.sendMessage(key, {
                action: 'registerNeoConfig',
                data  : {...config, windowId}
            })
        }
    }

    onWorkerConstructed(data) {
        let me = this;

        me.constructedThreads++;

        if (me.constructedThreads === me.activeWorkers) {
            // All workers are constructed, load the application
            NeoConfig.appPath && me.timeout(NeoConfig.loadApplicationDelay).then(() => {
                me.loadApplication(NeoConfig.appPath)
            })
        }
    }

    loadApplication(path) {
        this.sendMessage('app', {
            action       : 'loadApplication',
            path,
            resourcesPath: NeoConfig.resourcesPath
        })
    }

    // ...
}
```

The WorkerManager:
1. Detects browser features (Web Workers, SharedWorkers)
2. Creates workers for App, VDom, Data, etc. based on configuration
3. Sends the Neo.config to each worker
4. When all workers are constructed, it loads the application by sending a message to the App worker

### 6. App Worker: Loading the Application

The App worker receives the 'loadApplication' message and loads the application. It's important to note that an "App" in Neo.mjs is an instance of Neo.controller.Application, which is not common in other frameworks like React, Angular, or Vue (which typically just use a tag):

```javascript
class App extends Base {
    // ...

    onLoadApplication(data) {
        let me       = this,
            {config} = Neo,
            app, path;

        if (data) {
            me.data = data;
            config.resourcesPath = data.resourcesPath
        }

        path = me.data.path;

        if (config.environment !== 'development') {
            path = path.startsWith('/') ? path.substring(1) : path
        }

        me.importApp(path).then(module => {
            app = module.onStart();

            // short delay to ensure Component Controllers are ready
            config.hash && me.timeout(5).then(() => {
                HashHistory.push(config.hash);
            })
        })
    }

    importApp(path) {
        if (path.endsWith('.mjs')) {
            path = path.slice(0, -4)
        }

        return import(
            /* webpackInclude: /(?:\/|\\)app.mjs$/ */
            /* webpackExclude: /(?:\/|\\)(dist|node_modules)/ */
            /* webpackMode: "lazy" */
            `../../${path}.mjs`
        )
    }

    // ...
}
```

The App worker:
1. Receives the 'loadApplication' message with the path to the application
2. Calls importApp(path) to dynamically import the application module
3. When the module is loaded, it calls the onStart method of the module
4. If there's a hash in the config, it pushes it to the HashHistory after a short delay

### 7. Application Entry Point: app.mjs

Finally, the application's `app.mjs` file is loaded and executed:

```javascript
import Overwrites from './Overwrites.mjs'; // Optional framework extensions
import Viewport   from './view/Viewport.mjs'; // Your main UI component

export const onStart = () => Neo.app({
    mainView: Viewport, // Root component of your application
    name    : 'MyApp'   // Application identifier
})
```

The app.mjs file:
1. Imports any overwrites and the main view (Viewport)
2. Exports an onStart function that creates a new Neo application
3. The application is configured with a main view and a name

### 8. Component Tree Construction

When Neo.app() is called, it creates an Application controller and instantiates your mainView component:

```javascript
// Your Viewport component
class Viewport extends Container {
    static config = {
        className: 'MyApp.view.Viewport',
        layout: 'vbox',
        items: [
            HeaderComponent, // Child components
            MainContainer,   // All created in App Worker
            FooterComponent
        ]
    }
}
```

The component instantiation process:
1. Viewport is created in the App Worker
2. Child components are instantiated recursively
3. Event listeners are attached via the framework's event system
4. Data bindings are established for reactive updates

### 9. VDom Generation and Initial Render

Once the component tree is built:

1. Each component generates its virtual DOM structure
2. The framework builds a complete virtual DOM tree
3. The VDom Worker calculates the initial DOM structure
4. Relevant CSS files will get lazy-loaded before the DOM is touched to avoid reflows
5. The Main Thread creates the actual DOM elements
6. The event system is activated

## Summary

The Neo.mjs application bootstrap process follows these key steps:

1. **index.html** loads the MicroLoader
2. **MicroLoader.mjs** fetches the configuration and imports Neo.Main
3. **Neo.Main** initializes the main thread and creates the Neo.worker.Manager
4. **Neo.worker.Manager** creates the workers (Neo.worker.App, VDom, Data, etc.)
5. When all workers are constructed, Neo.worker.Manager sends a 'loadApplication' message to the Neo.worker.App worker
6. **Neo.worker.App** receives the message and dynamically imports the application module
7. **app.mjs** is executed, and its onStart function creates the application
8. **Component Tree** is constructed in the Neo.worker.App worker
9. **VDom Generation and Rendering** creates the actual DOM in the main thread

This multi-threaded architecture allows your application code to run in either a dedicated or shared Neo.worker.App worker, completely separate from DOM manipulation, providing better performance and responsiveness.
