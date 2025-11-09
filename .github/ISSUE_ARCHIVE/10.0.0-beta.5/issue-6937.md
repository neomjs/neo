---
id: 6937
title: Implement `mergeStrategy` for Reactive Configs
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-04T12:14:58Z'
updatedAt: '2025-10-22T22:56:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6937'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-04T16:57:27Z'
---
# Implement `mergeStrategy` for Reactive Configs

**Reported by:** @tobiu on 2025-07-04

### Summary

The reactive config system (`_` suffix) provides powerful reactivity, but it currently lacks a declarative mechanism for merging default config values with instance-specific values at creation time. This feature proposes implementing the `mergeStrategy` property on the `core.Config` class to allow for intelligent merging of configs (e.g., objects or arrays) when an instance is created, instead of simple replacement.

### The Problem

Currently, if a class defines a default value for a config (e.g., a `style` object), and an instance is created with a new `style` object, the default is completely replaced. The developer must manually read the default, clone it, and merge it with their new values, which is verbose and inefficient.

**Example (Current Behavior):**
```javascript
// in MyComponent.mjs
static config = {
    // Default style
    style_: { color: 'blue', fontWeight: 'bold' }
}

// On creation
const instance = Neo.create(MyComponent, {
    // This object REPLACES the default, it does not merge with it.
    style: { fontSize: '14px' }
});

// Result: instance.style is { fontSize: '14px' }
// Desired: { color: 'blue', fontWeight: 'bold', fontSize: '14px' }
```

### Proposed Solution

The solution is to activate the `mergeStrategy` property that already exists as a placeholder in `Neo.core.Config`. This strategy will be applied **only once** during the instance's construction phase. Subsequent `set()` calls will continue to replace the value, preserving predictable runtime behavior.

This will be implemented in two main steps:

1.  **`Neo.setupClass()` Enhancement:**
    *   The `setupClass` method in `src/Neo.mjs` will be modified to recognize config descriptors.
    *   When a config is defined using `{ [isDescriptor]: true, ... }`, `setupClass` will:
        *   Extract the entire descriptor object and store it in a new, merged static property on the constructor, e.g., `MyClass.configDescriptors`.
        *   Extract the `value` property from the descriptor and place it in the standard `MyClass.config` object as the default value.

2.  **`core.Base#mergeConfig()` Implementation:**
    *   The `mergeConfig` method in `src/core/Base.mjs` is the ideal location to apply the one-time merge.
    *   During instance construction, this method will iterate over the incoming configs.
    *   For each config, it will check `this.constructor.configDescriptors` for a `mergeStrategy` (e.g., `'shallow'` or `'deep'`).
    *   If a strategy other than the default (`'replace'`) is found, it will merge the static default value from `this.constructor.config` with the instance-specific value from the creation `config` object.
    *   This merged value will then be assigned to the instance.

### Example (Proposed Behavior)

With this change, developers can declaratively control the merge behavior.

```javascript
import {isDescriptor} from '../core/ConfigSymbols.mjs';

// in MyComponent.mjs
static config = {
    style_: {
        [isDescriptor]: true,
        value: { color: 'blue', fontWeight: 'bold' },
        merge: 'shallow' // or 'deep'
    }
}

// On creation, the merge is applied automatically
const instance = Neo.create(MyComponent, {
    style: { fontSize: '14px', fontWeight: 'normal' }
});
// Result: instance.style is { color: 'blue', fontWeight: 'normal', fontSize: '14px' }

// Subsequent set() calls will REPLACE the value as expected
instance.style = { backgroundColor: 'red' };
// Result: instance.style is { backgroundColor: 'red' }
```

This provides a more intuitive, powerful, and declarative way to handle complex configurations at creation time without adding runtime overhead.

