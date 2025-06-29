# The Neo.mjs Instance Lifecycle

Understanding the lifecycle of a class instance in Neo.mjs is crucial for building robust and predictable applications. The framework provides a series of well-defined hooks that allow you to tap into different stages of an instance's life, from its creation to its destruction.

This guide will walk you through the entire lifecycle, starting with the initial synchronous steps and moving on to the asynchronous parts and destruction.

## 1. The Synchronous Creation Flow

When you create a new instance of a Neo.mjs class using `Neo.create()`, the framework executes a sequence of synchronous methods on the new instance. This initial phase is responsible for setting up the instance's basic configuration and state.

The synchronous lifecycle methods are called in the following order:

1.  **`construct(config)`**: This is the first method called on a new instance. Its primary role is to process the configuration object passed to `Neo.create()`. It's here that the initial values for your configs are processed and applied.

2.  **`onConstructed()`**: This hook is called immediately after `construct()` has finished. It's the ideal place to perform any setup that depends on the initial configuration, such as setting initial values for other properties or starting a process.

3.  **`onAfterConstructed()`**: This hook is called after `onConstructed()`. It provides another opportunity for setup logic, which can be useful for separating concerns or for logic that needs to run after the primary `onConstructed` logic has completed.

4.  **`init()`**: This is the final synchronous hook in the creation process. It's a general-purpose initialization method that you can use for any final setup tasks before the instance is returned by `Neo.create()`.

It's important to remember that all of these methods are synchronous. Any asynchronous operations should be handled in the later, asynchronous phases of the lifecycle.