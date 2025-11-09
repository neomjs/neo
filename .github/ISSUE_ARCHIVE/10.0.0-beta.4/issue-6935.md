---
id: 6935
title: Enhanced Method Sequencing
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-02T18:26:06Z'
updatedAt: '2025-07-02T18:51:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6935'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-02T18:51:30Z'
---
# Enhanced Method Sequencing

**Reported by:** @tobiu on 2025-07-02

## Feature Description

This feature proposes the integration of an enhanced `createSequence` utility and a new `unSequence` utility into the Neo.mjs framework, located in `src/util/Function.mjs`. These utilities provide a robust mechanism for dynamically chaining multiple functions to an existing method and subsequently unchaining them.

### `createSequence(target, methodName, fn, scope)`

The updated `createSequence` function allows for multiple functions (`fn`) to be chained to a single `methodName` on a `target` object. When the `methodName` is invoked, the original method (if any) will execute first, followed by all currently sequenced functions in the order they were added.

### `unSequence(target, methodName, fn, scope)`

The new `unSequence` function provides the ability to remove a specific chained function (`fn` with its `scope`) from a `methodName` on a `target` object. If, after unsequencing, no functions remain chained to the method, the original method is automatically restored.

## Motivation

The previous `createSequence` implementation only supported chaining a single function to a method, which limited its flexibility and utility for complex scenarios requiring multiple extensions to a single point of execution.

The introduction of `unSequence` addresses a critical need for dynamic method management, allowing developers to:
- Cleanly remove event listeners or behaviors that are no longer needed.
- Prevent memory leaks by ensuring that chained functions can be properly detached.
- Enable more sophisticated plugin architectures and runtime modifications.

This enhancement significantly improves the framework's capabilities for method interception, extension, and dynamic behavior management, aligning with modern JavaScript development patterns.

## Proposed Changes

The implementation involves:
- Modifying `src/util/Function.mjs` to include the new `createSequence` logic that supports multiple chained functions using internal `Symbol`s (`_sequencedFns`, `_originalMethod`).
- Adding the new `unSequence` function to `src/util/Function.mjs` to handle the removal of chained functions and restoration of original methods.

These changes are already implemented locally and have been tested.

## Benefits

- **Increased Flexibility:** Allows multiple functions to extend a single method, enabling more modular and extensible code.
- **Improved Resource Management:** `unSequence` helps prevent memory leaks and ensures proper cleanup of dynamically added behaviors.
- **Enhanced Dynamic Behavior:** Facilitates more complex runtime modifications and plugin systems.
- **Clearer API:** Provides a dedicated mechanism for both adding and removing sequenced functions.

## Impact

This change is backward-compatible with the previous `createSequence` usage for single function chaining, as the new implementation gracefully handles both single and multiple sequenced functions. The addition of `unSequence` is a net new feature with no breaking changes.

## Example Usage (Conceptual)

```javascript
class MyComponent extends Neo.core.Base {
    static config = {
        message: 'Hello'
    }

    sayHello() {
        console.log(this.message);
    }
}

const myInstance = Neo.create(MyComponent);

// Sequence a function
const func1 = function() {
    console.log('Sequenced function 1');
};
createSequence(myInstance, 'sayHello', func1);
myInstance.sayHello();
// Expected output:
// Hello
// Sequenced function 1

// Sequence another function
const func2 = function() {
    console.log('Sequenced function 2');
};
createSequence(myInstance, 'sayHello', func2);
myInstance.sayHello();
// Expected output:
// Hello
// Sequenced function 1
// Sequenced function 2

// Unsequence func1
unSequence(myInstance, 'sayHello', func1);
myInstance.sayHello();
// Expected output:
// Hello
// Sequenced function 2

// Unsequence func2 (restores original method)
unSequence(myInstance, 'sayHello', func2);
myInstance.sayHello();
// Expected output:
// Hello
```

## Comments

### @tobiu - 2025-07-02 18:51

the export syntax is broken.

