## Introduction

Neo.mjs was the very first frontend framework, which enabled full support for a zero builds instant development mode,
while sticking to the latest ECMAScript features (e.g. the ES6 class system, modules and dynamic imports).

Developers can save massive amounts of time when creating and debugging their apps, but at some point apps want to be
deployed. To do this right, it is crucial to have an overview of the available environments.

## Zero builds development mode

JavaScript was originally conceived as the sole programming language capable of running directly within web browsers,
defining the interactive web experience. By around the year 2012, JS evolved significantly faster outside the Browser in
environments like Node.js, free from the constraints of browser release cycles and offering access to a broader set of APIs.
Developers, naturally wanting to use the latest language features, and especially Angular and React, picked up on this,
moving the entire frontend development into Node.js. This way, the new features were available, but at the significant
cost of introducing a mandatory, and often complex, build step, since developers now wrote code which Browsers can not
understand.

Over time, an entire ecosystem evolved around this paradigm. Think of hot module replacements, the webpack-dev-server,
Vite, or Bun. While builds have become reasonably fast, developers receive transpiled and bundled code in the Browsers,
which can introduce debugging challenges and requires source-maps to even have a chance of debugging.

What most companies and developers have completely missed is the fact that Browser Vendors have done a great job at
catching up with modern ECMAScript features (like classes, dynamic imports, and native browser module support).
At this point in time, we can create highly modern and performant code directly inside Browsers again.

Especially when it comes to debugging, the advantages are huge: No source-maps are needed, and developers can work with
the real code, even inside the dev-tools console.

Neo.mjs picks up on this pattern, and even supports the full creation of apps directly inside the console. Developers can
easily grab existing Component instances inside the console, inspect and change reactive configs on the fly, and watch
the UI update instantly – even within a multi-window scope, or creating entirely new components directly.

This is possible because Neo.mjs is ***100% based on web standards***. There's no hidden magic or proprietary syntax;
you're working directly with what the browser understands. This commitment to standards provides a level of transparency
and future-proofing that's hard to match.

Sticking exclusively to the builds dev-mode paradigm means relying on an abstraction layer that moves away from the
browser's native capabilities. History has shown the advantages of embracing the web platform directly, as seen with the
evolution from plugin-based solutions to native browser features. Neo.mjs champions this direct, standards-aligned
approach, providing a future-proof development experience.

## dist/esm: Embracing Native ES Modules for Modern Deployment

While Neo.mjs's zero-builds development mode offers unmatched speed and debugging clarity, deploying your application
effectively for the world requires a different set of considerations. This is where the **`dist/esm`** environment steps in:
it represents the optimal bridge between raw development efficiency and a robust, modern deployment.

The `dist/esm` environment allows you to deploy your Neo.mjs application as a collection of native ES Modules.
This means you're not shipping a single, monolithic JavaScript bundle, but rather smaller, individual module files.

### Identical Code Structure to Dev Mode

A standout feature of `dist/esm` is that it preserves the exact same file and folder structure as your development mode.
This means the code you deploy is the same code you develop and debug. There are no opaque bundling transformations, no complex source map deciphering; what you see in your IDE is precisely what's running in the browser. This unparalleled fidelity dramatically simplifies debugging and vastly reduces "it works on my machine" scenarios.

### Native Modularity, Uncompromised

`dist/esm` fully embraces native ES Module support in modern browsers. Each class and utility remains its own module,
directly loaded by the browser as needed. This aligns perfectly with the "100% web standards" philosophy of Neo.mjs – no
proprietary bundlers or complex configurations obscuring your code.

### Leveraging HTTP/2 & HTTP/3 for Efficiency

With the capabilities of modern protocols like HTTP/2 and HTTP/3, serving numerous small module files becomes incredibly
efficient. Browsers can fetch these modules in parallel, often leading to faster initial load times and significantly
improved caching granularity compared to large, single bundles.

### Optimized On-Demand Delivery for Dynamic UIs

When your application needs to render a new component or view based on a JSON blueprint (whether manually crafted,
backend-generated, or dynamically produced), the framework efficiently fetches only the specific component modules
required for that UI, without loading unnecessary code upfront. This ensures optimized resource usage and faster
rendering for dynamic content.

### Unparalleled Debugging in Production

Since the code remains in its modular, unbundled form (though optimized compared to dev mode), debugging issues in a
live `dist/esm` environment is dramatically simpler. You're working directly with the actual files and module structure.

### Seamless Shared Worker Integration

The same modular `dist/esm` code is efficiently loaded into both the main thread and the application worker(s), ensuring
consistent environments and maximizing the benefits of multi-threading for responsive interfaces.

In essence, `dist/esm` is about deploying your Neo.mjs application with the future of the web in mind: native, modular,
performant, and transparent. It's ideal for environments where modern server capabilities can efficiently serve
individual ES module files, giving you a deployment that's fast, flexible, and exceptionally easy to maintain and debug.

## dist/production: Optimized Bundles for Broadest Reach and Ultimate Minification

While the dist/esm environment champions the future of native browser modules, the `dist/production` environment caters
to scenarios demanding the broadest compatibility, ultimate minification, and traditional single-file deployment benefits.

This environment utilizes Webpack, an industry-standard bundler, to process your application's code. However, true to
Neo.mjs's multi-threaded architecture, this bundling process is intelligently designed:

### Thread-Specific Bundles

Instead of creating a single, monolithic JavaScript file for your entire application, `dist/production` generates separate,
optimized bundles for each distinct thread context: a dedicated bundle for the main thread, containing only the code
necessary for the DOM bridge, event handling, and initial application setup, and a separate bundle for the application
worker(s), containing all the application logic, Vdom processing, and state management that operates off the main thread.

### Reduced Overhead per Thread

This unique thread-specific bundling significantly reduces overhead. Each thread only loads and parses the JavaScript
code that is strictly relevant to its operations. The main thread doesn't waste resources parsing complex application
logic, and the worker isn't burdened with parsing main-thread-specific DOM manipulation code. This contributes to
faster startup times and more efficient memory usage in each isolated thread.

### Aggressive Optimizations

The Webpack build pipeline in `dist/production` applies aggressive optimizations such as:

* ***Minification & Uglification***: Stripping away whitespace, shortening variable names, and performing other
  transformations to achieve the smallest possible file sizes.
* ***Dead Code Elimination*** (Tree Shaking): Removing any code that is not actually used by the application, further
  reducing bundle size.

### Broadest Browser Compatibility

Bundling typically includes polyfills and transpilation for older ECMAScript features, ensuring your application runs
smoothly even on browsers that don't fully support the latest web standards (which dist/esm relies upon).

### Simplified Single-File Deployment
For environments where serving multiple module files isn't optimal, or for legacy server setups, `dist/production`
provides the convenience of deploying just a few highly optimized bundle files.

In summary, `dist/production` is Neo.mjs's answer for maximum compatibility and minimal payload, offering a robust,
Webpack-powered build that respects the framework's multi-threaded nature to deliver highly optimized bundles for each
part of your application.

## dist/development

todo

## Environment Combinations

todo
