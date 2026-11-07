# Features and Benefits Summary

Neo.mjs is a complete application platform for every desktop and mobile web application. It ships more than 450
classes in 39 namespaces: the components, data layer and tooling that teams otherwise assemble from dozens of
packages, in one MIT-licensed install. It builds the applications teams build with
[Angular, React or Vue](../../comparisons/Overview.md) today, at
[feature parity with Ext JS](../../comparisons/NeoVsExtJs.md) and generations ahead of it in architecture. Below are
the capabilities that set it apart.

## A Complete Component Platform

Everything a real application needs is already in the box, built on one class system and one config system:

*   **Grids** (`src/grid/`, 38 classes): locked columns, header groups, cell editing, tree, sparkline, progress and
    currency columns, and buffered rendering of 100,000 rows that keeps scrolling smooth.
*   **Forms** (`src/form/`): 26 field types, nested and lazy-loaded forms, and a state provider built into every form.
    See the [Forms Engine](FormsEngine.md).
*   **Calendar** (`src/calendar/`, 28 classes), **Dock Layouts** for multi-window workspaces (`src/dashboard/dock`,
    42 classes), and tabs, dialogs, toolbars, menus, lists and trees.
*   **8 layouts**: Card, Cube, Fit, Flexbox, Form, Grid, HBox and VBox.
*   **38 main-thread addons**: charts (AmCharts), maps (Google Maps, Mapbox GL, OpenStreetMap, CesiumJS), the Monaco
    editor, Markdown, Mermaid, syntax highlighting, service workers, server-side rendering and web components.
*   **The data layer**: stores, models, state providers, selection models and routing.
*   **Themes** that nest, so one part of an application can carry its own look.

## Multi-Window Applications

Neo.mjs runs one application across several browser windows without a desktop shell like Electron. All windows share
the same data and state, and components move between windows while keeping their JavaScript instances, so a chart can
tear out onto a second monitor without losing what it shows. Dock Layouts bring the docking language of desktop IDEs to
the browser: drag panes between zones, tear them out into their own windows, and save arrangements as named
perspectives. Any application whose users work across screens benefits, from back-office tools to analytics
dashboards. See [Multi-Window Applications](MultiWindow.md).

## True Multi-threading (Off-The-Main-Thread Architecture)

At the heart of Neo.mjs is its Off-Main-Thread (OMT) architecture. Your entire application, including the engine
itself, runs inside a dedicated application worker, and the engine manages that worker for you: your code is plain
classes and configs. All business logic, data processing and UI updates stay off the main thread, so the interface
never freezes, even during heavy computation or data I/O. Further workers handle OffscreenCanvas rendering, data, delta
updates and tasks, alongside a ServiceWorker for predictive caching. Learn more in
[Off the Main Thread](OffTheMainThread.md) and [Extreme Speed](Speed.md), which documents an observed peak of more than
40,000 delta updates per second.

## JSON-First Since 2019, for Humans and Coding Agents

Since its first release in November 2019, every Neo.mjs UI has been a JSON blueprint: declarative `static config`
objects instead of render functions. You describe what the application is, and the engine builds and updates it. That
same shape is what language models read and write best, so the blueprints you write by hand are the ones your coding
agent writes natively, with no JSX compilation and no hook rules to get wrong. See
[JSON-First UIs](JSONFirstUIs.md).

## Your Coding Agent, Inside Your Running App

Most coding agents only ever see source files. Through the [Neural Link](../../agentos/NeuralLink.md), your agent
(Claude Code, Codex, Gemini or another) connects to your running application: it inspects the live component tree,
stores and state providers, drives real interactions, and hot-patches methods without a reload, across every window.
Neo.mjs itself is built this way, by a team of named AI maintainers from rival labs whose work is public;
[What Is Neo.mjs?](../Introduction.md) tells that story with its receipts.

## Zero-Build Development

The development mode runs without transpilation or compilation: you work directly with standards-based JavaScript.
That means instant feedback, simpler debugging, and the latest ECMAScript features as soon as browsers support them,
which cuts development costs and speeds up every iteration. Discover the details in
[4 Environments](FourEnvironments.md) and [Quick Application Development](Quick.md).

## Elegant State Management

Manage your application's data with Neo.mjs's state management system. It supports multiple communicating state
providers and leverages observable patterns for reactive data flows. This flexible approach allows you to adopt
various architectural patterns, like MVVM, without being rigidly enforced, giving you the freedom to choose the best
fit for your project. More on this in [Quick Application Development](Quick.md).

## Core Architectural Features

*   **RPC Layer**: A robust Remote Procedure Call (RPC) layer facilitates seamless, cross-realm communication,
    extending even to backend integrations. Learn more in [The Neo.mjs RPC Layer](RPCLayer.md).
*   **Extensibility & Scalability**: The engine is designed for maximum extensibility, allowing you to easily integrate
    custom logic and scale your applications from small prototypes to large-scale enterprise solutions.
*   **Class Config System**: A unified, declarative class config system simplifies component definition and management,
    ensuring consistency across your entire application.
*   **Drag & Drop**: Built-in support for intuitive drag-and-drop interactions enhances user experience.
*   **Mixins, Plugins & Main-Thread Addons**: A rich set of tools for extending functionality, integrating third-party
    libraries, and interacting with the main browser thread when necessary.

Neo.mjs's feature set is crafted to give you a superior development experience and to deliver high-performance,
scalable and maintainable web applications that stand out in today's demanding digital landscape.
