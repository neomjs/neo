---
id: 7081
title: Introduce Neo.gatekeep() to Standardize Module Exports
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-18T12:23:25Z'
updatedAt: '2025-07-18T12:34:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7081'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-18T12:34:49Z'
---
# Introduce Neo.gatekeep() to Standardize Module Exports

**Reported by:** @tobiu on 2025-07-18

## Summary:

This ticket proposes the creation and implementation of a new utility method, `Neo.gatekeep()`, within the core Neo.mjs module. The primary goal is to replace the current repetitive and imperative boilerplate used for exporting core, non-component classes and singletons. This change will result in a cleaner, more declarative, and consistent codebase, while also formalizing and strengthening the framework's critical environment protection mechanism.

It is about consistency to `Neo.setupClass()`, which protects all `Neo.core.Base` related extensions.

## Problem Statement:

Currently, several core utility modules such as `IdGenerator`, `Config`, and `Compare` use a verbose if block to check if the class or singleton has already been registered in the Neo namespace before exporting it. This pattern is duplicated across many files, leading to code redundancy and making maintenance more difficult. It also obscures the important "first one wins" logic that is fundamental to the framework's ability to handle mixed-environment scenarios.

```javascript
Neo.core ??= {};

if (!Neo.core.IdGenerator) {
    Neo.core.IdGenerator = IdGenerator;
    Neo.getId = IdGenerator.getId.bind(IdGenerator);
}

export default Neo.core.IdGenerator;
```

## Proposed Solution:

We will introduce a new method, `Neo.gatekeep()`, in Neo.mjs. This method will centralize the registration logic for simple classes and singletons that do not extend Neo.core.Base.

The function will accept three arguments: the module to be registered (which can be a class constructor or a singleton object), the full string path for its namespace, and an optional callback function.

Its core logic will be to first check if the given namespace path already exists. If it does, the method immediately returns the existing module, enforcing the "first one wins" rule. If it does not exist, the method will create the namespace, register the new module, and execute the optional callback. This callback is ideal for one-time setup tasks, such as creating the Neo.getId alias when IdGenerator is first registered.

```javascript
// in src/Neo.mjs
/**
 * Ensures a class or singleton is assigned to the Neo namespace only once, preventing duplicates.
 * This is a lightweight version of `Neo.setupClass` for simple classes or objects
 * that do not extend `Neo.core.Base`.
 * It follows a "first one wins" strategy.
 *
 * @param {Function|Object}  module    - The class constructor or singleton object to register.
 * @param {String}           classPath - The fully qualified name (e.g., 'Neo.core.IdGenerator').
 * @param {Function}        [onFirst]  - An optional callback that runs only the first time the item is registered.
 * @returns {Function|Object} The class or singleton from the Neo namespace (either the existing one or the newly set one).
 */
gatekeep(module, classPath, onFirst) {
    const existingClass = Neo.ns(classPath, false);

    if (existingClass) {
        return existingClass
    }

    const
        nsArray   = classPath.split('.'),
        className = nsArray.pop(),
        parentNs  = Neo.ns(nsArray, true);

    parentNs[className] = module;

    onFirst?.(module);

    return parentNs[className]
}
```

## Key Benefits:

1.  **Code Clarity and Consistency:** Replaces a multi-line imperative block with a single, declarative function call, making the intent of the module's export clear and consistent across the codebase.
2.  **Reduced Boilerplate:** Eliminates redundant code, making modules shorter and easier to read and maintain.
3.  **Centralized Logic**: The critical "first one wins" gatekeeping logic is managed in one place, improving robustness and simplifying future modifications.
4.  **Enhanced Environment Protection:** This change formalizes the mechanism that allows Neo.mjs to safely combine different build environments at runtime, such as a dist/production application dynamically loading a module from dist/esm. It guarantees that there will never be a duplicate instance of a critical singleton or class definition, which is essential for application stability.

```javascript
// The entire export block is replaced with this single line:
export default Neo.gatekeep(IdGenerator, 'Neo.core.IdGenerator', () => {
    Neo.getId = IdGenerator.getId.bind(IdGenerator);
});
```

## Tasks:

1.  Implement the Neo.gatekeep method in src/Neo.mjs.
2.  Refactor the following modules to use Neo.gatekeep for their exports:
    *   src/core/Compare.mjs
    *   src/core/Config.mjs
    *   src/core/Effect.mjs
    *   src/core/EffectBatchManager.mjs
    *   src/core/EffectManager.mjs
    *   src/core/IdGenerator.mjs
    *   src/vdom/VNode.mjs

