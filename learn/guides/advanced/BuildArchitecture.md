# Build Architecture & Service Workers

This guide explores the advanced interplay between Neo.mjs's build artifacts, the environment configuration system, and the Service Worker's role as a programmable network layer. Understanding this architecture is critical for debugging production issues where the "Zero-Build" development logic translates into optimized, multi-threaded production bundles.

## The Core Challenge: Dual-State Existence

Neo.mjs applications exist in two distinct states that share the same source code but operate with radically different loading mechanics:

1.  **Development (Zero-Build):** The browser loads individual source files directly via native ESM imports. Paths are relative to the project root.
2.  **Production (Webpack + Native ESM):** The application is compiled into optimized bundles (Native ESM) for each thread (`main`, `app`, `vdom`, `data`). Paths are flattened or restructured into a `dist/` folder.

## 1. Universal Entry Points & The "Inverted" Bundler Model

Unlike standard bundlers (Webpack, Vite) which assume **1 App = 1 Entry Point** (typically `index.html`), Neo.mjs uses an inverted model: **1 Application Engine = Many Apps**.

### The Shared Runtime Kernel
Neo.mjs uses universal entry points for all applications:
*   **Main Thread:** `Main.mjs` (or `main.js` in dist) is the single entry point for the main thread of *all* apps.
*   **App Worker:** `worker.App` is the single entry point for the application logic of *all* apps.

### The `importApp` Bridge
Since the App Worker is generic, it must dynamically load the specific application logic based on the user's context. This is achieved via the `importApp(path)` method in `worker.App`.

**How it works:**
1.  It takes an `appPath` (e.g., `apps/agentos/app.mjs`).
2.  It uses a dynamic `import()` statement.
3.  **Webpack Magic:** It uses `webpackInclude` and `webpackExclude` comments to create a "meta-bundle" that includes every `app.mjs` file in the project as a potential lazy-loaded chunk.

```javascript
importApp(path) {
    // ... path normalization ...
    return import(
        /* webpackInclude: /(?:\/|\\)app.mjs$/ */
        /* webpackExclude: /(?:\/|\\)(buildScripts|dist|node_modules)/ */
        /* webpackMode: "lazy" */
        `../../${path}.mjs`
    )
}
```

This allows a single cached `appworker.js` to power any application in the workspace by fetching only the specific app chunk needed.

## 2. Tree Levels & Path-Based Configuration

Neo.mjs workspaces can contain applications at varying folder depths (e.g., `examples/button/base/` vs `examples/form/field/text/`). To handle this, the framework relies on **Path-Based Configuration**.

Each application folder contains:
1.  `index.html`: The boot file.
2.  `neo-config.json`: The local configuration map.

These files serve as the "anchor" that tells the generic runtime "where am I relative to the root?".

### The Config Shift: Dev vs. Dist

The build process (specifically `webpack.config.appworker.mjs`) actively rewrites `neo-config.json` to accommodate the structural shift from the source directory to the `dist` output.

#### Example: `apps/agentos`

**Development (`apps/agentos/neo-config.json`):**
*   **Physical Depth:** 2 levels from root.
*   `basePath`: `../../` (Matches physical depth).
*   `mainPath`: `./Main.mjs` (Source entry).
*   `appPath`: `apps/agentos/app.mjs` (Stable identifier).

**Production (`dist/production/apps/agentos/neo-config.json`):**
*   **Physical Depth:** 4 levels from root (`dist/production/apps/agentos/`).
*   `basePath`: `../../../../` (Adjusted to match new depth).
*   `mainPath`: `../main.js` (Points to the bundled entry).
*   `workerBasePath`: `../../` (Crucial injection).

### The `workerBasePath` Injection
In development, the App Worker source lives in `src/worker/`. In production, the bundled `appworker.js` typically sits at the root of the environment (e.g., `dist/production/appworker.js`).

The `workerBasePath: "../../"` config configures the bundled worker to "look back" 2 levels when resolving paths, effectively emulating the original `src/worker/` nesting. This ensures that relative path logic inside the worker continues to function correctly despite the flattened build structure.

## 3. Webpack & Native ESM Output

As of v11.23.0, Neo.mjs has migrated its build system to output **Native ES Modules** (`outputModule: true`) for all workers and the main thread.

### Key Build Differences

| Feature | Development (Zero-Build) | Production (Dist) |
| :--- | :--- | :--- |
| **Module Format** | Source ESM (`import ... from './File.mjs'`) | Bundled ESM (`import ... from './chunks/app/id.js'`) |
| **Path Resolution** | Relative to file | `publicPath: 'auto'` (Relative to entry chunk) |
| **Worker Creation** | `new Worker('src/worker/App.mjs')` | `new Worker('appworker.js')` |

### The `publicPath: 'auto'` Shift
The switch to `auto` means Webpack dynamically determines where to load chunks based on the location of the loading script. This makes the `workerBasePath` and `basePath` calculations even more critical, as they ensure the runtime requests assets from the correct physical URL.

## 4. The Deployment Anomaly: Competing Service Workers

In a standard web deployment, you typically push **one** environment (e.g., `dist/production`) to your web root. There is one Service Worker, one scope, and one truth.

The **Neo.mjs Repository** deployment is unique. To allow developers to compare performance and debugging experiences, the *entire* repository is deployed. This means **Development**, **Dist/ESM**, and **Dist/Production** environments coexist on the same domain.

### The Nested Scope Problem
This creates a scenario with multiple, overlapping Service Workers:

1.  **Root SW (`/ServiceWorker.mjs`):** Scoped to `/`. Controls the dev mode and the main landing page.
2.  **Dist SWs (`/dist/production/serviceworker.js`):** Scoped to `/dist/production/`.

**The Conflict:**
When a user visits an app inside `/dist/production/`, they are technically within the scope of *both* Service Workers.
*   If they visited the homepage first, the **Root SW** is likely already installed and controlling the page.
*   The **Dist SW** attempts to install itself for the nested scope.

While browsers generally allow a nested SW to shadow a root SW, this "Competing SW" scenario creates a complex debugging landscape. You must verify **which** Service Worker is currently controlling the page to understand why assets are (or aren't) being cached correctly.

**Debugging Tip:** Use the *Application -> Service Workers* tab in Chrome DevTools to see the active scope. Ensure the SW controlling your tab matches the environment you expect (Root vs. Dist).

## 5. The Root Domain Mapping & Base Tag Strategy

For the official **neomjs.com** website, we want the root domain to serve the **Production Portal** (`dist/production/apps/portal/`), while still keeping the physical file structure intact (to allow access to `/src`, `/examples`, etc.).

We achieve this by injecting a `<base>` tag into the root `index.html` during the deployment build process.

### The Mechanism
```html
<head>
    <base href="./dist/production/apps/portal/">
    <!-- ... -->
</head>
```
This tells the browser to resolve all relative assets (scripts, images, css) starting from the production folder, effectively "teleporting" the user into the production app while they are technically at the root URL.

### The Navigation Bug (and Fix)
A side effect of using `<base>` is that browsers often interpret hash links (e.g., `<a href="#mainview=home">`) as full URL navigations relative to the base, triggering a **full page reload** instead of a client-side route change.

To fix this, we inject a small script to intercept hash clicks and force a client-side update:

```html
<script>
document.addEventListener('click', function(event) {
    let {target} = event;
    // Walk up to find the anchor tag
    while (target && target.tagName !== 'A') target = target.parentElement;
    
    // If it's a hash link, prevent reload and set hash manually
    if (target?.getAttribute('href')?.startsWith('#')) {
        event.preventDefault();
        window.location.hash = target.getAttribute('href');
    }
});
</script>
```
This ensures the SPA experience remains seamless even when "projected" via a base tag.

## 6. Realm-Scoped Chunking

Neo.mjs is a **multi-realm Application Engine**. We have dedicated workers for App, Data, VDom, Canvas, Task, and the Main thread.

By default, Webpack assigns numeric IDs to chunks (e.g., `7.js`). If we simply output all threads to the same `dist` folder, `7.js` from the App Worker (containing business logic) would overwrite `7.js` from the Canvas Worker (containing rendering logic), causing catastrophic runtime errors.

### The Scoping Solution
We configure Webpack to output chunks into dedicated, realm-specific folders:

*   `chunks/app/`
*   `chunks/main/`
*   `chunks/canvas/`
*   `chunks/data/`
*   `chunks/task/`
*   `chunks/vdom/`

**Production Webpack Config Example:**
```javascript
output: {
    chunkFilename: 'chunks/app/[id].js', // Scoped to 'app'
    // ...
}
```

This isolation ensures that even if Webpack generates conflicting IDs across different builds, the physical files never collide. Each realm loads only its own scoped chunks.