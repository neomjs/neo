# Glossary

This glossary provides definitions for key terms and concepts used throughout the Neo.mjs documentation. Understanding
these terms is essential for grasping the engine's unique architecture and capabilities.

## A

### Actor Model

A programming paradigm where "actors" are the universal primitives of concurrent computation. In Neo.mjs, this concept
is applied to web workers, where each worker acts as an independent actor communicating via messages, enabling robust
multi-threaded applications.

### App Worker

The primary Web Worker in Neo.mjs where the majority of your application's logic, components, and business code reside.
It operates off the main thread, ensuring the UI remains responsive.

### Application Worker being the Main Actor Paradigm

A core architectural principle in Neo.mjs where the App Worker is the central hub for application logic and state, rather
than the main browser thread. This ensures UI responsiveness and efficient resource utilization.

## C

### Canvas Worker

A specialized Web Worker in Neo.mjs that can take ownership of an `OffscreenCanvas` DOM node. This allows computationally
intensive graphics rendering to occur entirely off the main thread, preventing UI blocking.

### Class Config System

Neo.mjs's unified, declarative system for defining and managing properties for all classes (components, models,
controllers, etc.) through a `static config` object. It provides consistency, reactivity, and powerful lifecycle hooks.

### Component Lifecycle

The series of well-defined stages an Neo.mjs class instance goes through, from its creation and initialization to its
destruction. The engine provides hooks (e.g., `construct`, `initAsync`, `destroy`) to tap into these stages.

### Component Library

A comprehensive collection of pre-built, production-ready UI components provided by Neo.mjs, designed to be highly
configurable and performant within the OMT architecture.

### Cross-worker communication

The mechanism by which different Web Workers (e.g., App Worker, Main Thread, VDom Worker) exchange messages and data.
Neo.mjs provides an efficient RPC layer for this.

## D

### Data Store

A Neo.mjs class (`Neo.data.Store`) that manages collections of data records. It can be configured declaratively and is
often used to provide data to UI components like grids.

### Data Worker

A specialized Web Worker in Neo.mjs primarily responsible for handling backend communication (e.g., AJAX calls, WebSocket
messages) and performing data transformations off the main thread.

### Declarative component trees

A method of building user interfaces in Neo.mjs by defining the desired structure and properties of components using
declarative configurations (often JSON-like objects) rather than imperative step-by-step instructions.

### Delta-updates

The minimal changes calculated by the VDom Worker (by comparing new and old Virtual DOM trees) that need to be applied
to the actual browser DOM. Sending only deltas optimizes UI updates.

### dist/development

One of Neo.mjs's four environments, representing a traditional "dev mode" with bundled but unminified code and source
maps. Used for debugging production-specific issues or by developers preferring TypeScript.

### dist/esm

One of Neo.mjs's four environments, designed for modern deployment. It preserves the native ES Module structure,
allowing browsers to load individual module files efficiently via HTTP/2 or HTTP/3.

### dist/production

One of Neo.mjs's four environments, providing highly optimized, minified, and thread-specific bundles (using Webpack)
for maximum compatibility and smallest payload, ideal for broad deployment.

## L

### Lazy-loaded Forms

A feature in Neo.mjs forms where form fields or sections are only loaded (but not necessarily mounted to the DOM) when
they are actually needed, optimizing initial load times for complex forms.

### Lifecycle hooks

Methods provided by the Neo.mjs engine that allow developers to execute custom logic at specific points during a
class instance's lifecycle (e.g., `beforeSet`, `afterSet`, `initAsync`, `destroy`).

## M

### Main Thread

The single browser thread responsible for rendering the user interface (DOM), handling user interactions, and executing
most traditional JavaScript. Neo.mjs aims to keep this thread as idle as possible for maximum responsiveness.

### Main-Thread Addons

Libraries or functionalities that require direct access to the browser's Main Thread (e.g., for DOM manipulation or
specific browser APIs). Neo.mjs provides mechanisms to integrate these while maintaining OMT benefits.

### MicroLoader

A lightweight JavaScript file that is the first part of the Neo.mjs engine loaded by the browser. It's responsible
for fetching the application's configuration and dynamically importing the main thread part of the engine.

### Mixins

A mechanism in JavaScript (and utilized by Neo.mjs) to compose classes by injecting properties and methods from other
classes, promoting code reuse without traditional inheritance. **Currently, Neo.mjs mixins copy methods but do not
automatically merge `static config` properties from the mixin into the consuming class's `static config`.**

### Multi-threaded architecture

The fundamental design of Neo.mjs that leverages Web Workers to distribute application logic and processing across
multiple CPU cores, ensuring a highly responsive user interface.

### Multi-Window Applications

Neo.mjs's native capability to run a single application across multiple browser windows, allowing seamless data and
state sharing, and enabling complex multi-screen user experiences.

## N

### Native ES modules

Modern JavaScript modules that can be directly loaded and executed by browsers without requiring a build step
(transpilation or bundling). Neo.mjs heavily relies on these for its zero-build development.

### ntype

A string alias used in Neo.mjs to declaratively specify the type of a component or class within a configuration object
(e.g., `ntype: 'button'`, `ntype: 'container'`).

## O

### Observable

A mixin (`Neo.core.Observable`) that provides event-driven capabilities to classes that include it. It enables objects
to emit custom events using the `fire()` method, and allows other objects to subscribe to these events using the `on()`
(or `addListener()`) method. This mechanism facilitates a publish-subscribe pattern, allowing components and other parts
of the application to react automatically to specific updates or actions.

### Off the Main Thread (OMT)

The core architectural principle of Neo.mjs, where the majority of the application's logic and processing runs in Web
Workers, separate from the browser's main thread, to ensure UI responsiveness.

## P

### Plugins

Extensible modules that can be added to Neo.mjs components to enhance their functionality without modifying their core
code, promoting modularity and reusability.

### Property lifecycle hooks

Specific methods (e.g., `beforeGet`, `beforeSet`, `afterSet`) that are automatically invoked when a Neo.mjs config
property is accessed or modified, allowing for validation, transformation, or reactive side effects.

## R

### Reactive Config

A feature of the Neo.mjs Class Config System where changes to config properties automatically trigger updates in the UI
or other dependent parts of the application.

### Remote Method Access (RMA)

Neo.mjs's mechanism for seamlessly calling methods on objects that reside in different Web Workers, Main Threads
(especially multiple ones in multi-window applications), or even backend services, abstracting away the complexities of
cross-context communication.

### RPC Layer

Remote Procedure Call layer. In Neo.mjs, this refers to the engine's built-in system for enabling methods to be called
on objects residing in different execution contexts (e.g., between workers, or to a backend) as if they were local.

### Routing

The process of mapping URL hash patterns to specific application states or views. Neo.mjs supports declarative routing
within its class config system, implemented inside `Neo.controller.Base`.

## S

### Service Worker

A type of Web Worker that acts as a programmable proxy between the browser and the network. In Neo.mjs, it's used for
predictive caching of assets and enabling offline capabilities.

### Shared Web Workers

A type of Web Worker that can be accessed by multiple browsing contexts (e.g., multiple browser tabs or windows) from
the same origin. Neo.mjs leverages these for its multi-window application capabilities.

### Source maps

Files that map transpiled or minified code back to its original source code, aiding debugging in environments where the
deployed code is not directly readable.

### State Management

The process of managing and synchronizing the data (state) of an application. Neo.mjs provides elegant features for this,
including reactive configs, state providers and observable patterns.

### State Provider

A Neo.mjs class responsible for managing and providing shared, bindable data (state) across different parts of an
application. Forms can include their own state providers.

## T

### Task Worker
A specialized Web Worker in Neo.mjs that can be used to offload specific, computationally expensive tasks that don't fit
into the other worker categories, ensuring the app worker and main thread remain free.

## U

### Unified Config System

See Class Config System.

## V

### Virtual DOM (VDom)

An in-memory representation of the actual browser DOM. Neo.mjs uses a lightweight, JSON-like VDom to describe UI
structures, enabling efficient delta calculations and updates to the real DOM.

### VDom Worker

A specialized Web Worker in Neo.mjs responsible for processing Virtual DOM trees, calculating delta updates (diffing)
between the current and new UI states, and sending these minimal changes to the Main Thread for rendering.

## W

### Web Workers

A browser technology that allows scripts to run in background threads, separate from the main execution thread. Neo.mjs
extensively uses various types of Web Workers to achieve its Off-Main-Thread architecture.

### Webpack

A popular open-source JavaScript module bundler. Neo.mjs uses Webpack in its `dist/production` and `dist/development`
environments to create optimized bundles for deployment.

## Z

### Zero-Build Development

A core feature of Neo.mjs that allows developers to run and debug applications directly in the browser using native ES
modules, without requiring a compilation or bundling step during development.
