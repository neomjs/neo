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
blockedBy: []
blocking: []
closedAt: '2025-07-02T18:51:30Z'
---
# Enhanced Method Sequencing

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

## Timeline

- 2025-07-02T18:26:06Z @tobiu assigned to @tobiu
- 2025-07-02T18:26:07Z @tobiu added the `enhancement` label
- 2025-07-02T18:33:53Z @tobiu referenced in commit `022f86d` - "Enhanced Method Sequencing #6935"
- 2025-07-02T18:34:38Z @tobiu closed this issue
### @tobiu - 2025-07-02T18:51:01Z

the export syntax is broken.

- 2025-07-02T18:51:01Z @tobiu reopened this issue
- 2025-07-02T18:51:23Z @tobiu referenced in commit `db44d9e` - "Enhanced Method Sequencing #6935"
- 2025-07-02T18:51:30Z @tobiu closed this issue
- 2025-07-02T19:04:37Z @tobiu referenced in commit `0f82e86` - "Enhanced Method Sequencing #6935 initial concept exploration"
- 2025-07-02T19:36:44Z @tobiu referenced in commit `4001e30` - "#6935 converted core.Compare and core.Util into non neo classes"
- 2025-07-02T19:37:39Z @tobiu referenced in commit `718b209` - "#6935 Neo.mjs: applying _configName to class prototypes as well"
- 2025-07-02T19:50:02Z @tobiu referenced in commit `b02a035` - "#6935 initial debugging, trying to get examples/button/base running inside the browser"
- 2025-07-02T21:15:12Z @tobiu referenced in commit `6dabed6` - "#6935 further testing, brainstorming, debugging"
- 2025-07-02T21:57:19Z @tobiu referenced in commit `4bb1869` - "#6935 concept exploration"
- 2025-07-02T22:09:02Z @tobiu referenced in commit `ec4bd84` - "#6935 concept exploration"
- 2025-07-02T22:46:28Z @tobiu referenced in commit `2e762de` - "#6935 Reached the PoC state"
- 2025-07-02T22:51:21Z @tobiu referenced in commit `e51da52` - "#6935 flexbox layout fix"
- 2025-07-02T22:53:49Z @tobiu referenced in commit `3244263` - "#6935 component.Base: beforeSetKeys() => restored to the old value"
- 2025-07-02T22:55:47Z @tobiu referenced in commit `ad07cee` - "#6935 component.Base: restored cls & style configs to their dev branch value"
- 2025-07-02T23:55:05Z @tobiu referenced in commit `c5ca069` - "#6935 core.Base: simplified the id generation, collection.Base: specific id for the allItems collection"
- 2025-07-02T23:57:04Z @tobiu referenced in commit `01e1069` - "#6935 container.Base: cleanup"
- 2025-07-03T00:26:13Z @tobiu referenced in commit `2e54226` - "#6935 core.Config: JSDoc, changed the initial value setting strategy to not lose meta objects."
- 2025-07-03T00:43:06Z @tobiu referenced in commit `aa536b3` - "#6935 component.Base: vnode config => descriptor"
- 2025-07-03T00:55:44Z @tobiu referenced in commit `c494272` - "#6935 component.Base: removed afterSetFlex() => flex is not a config"
- 2025-07-03T01:31:43Z @tobiu referenced in commit `1960cfa` - "#6935 core.Base: construct() => ensure to only create config instances for keys that should be configs"
- 2025-07-03T01:35:18Z @tobiu referenced in commit `4a4fc18` - "#6935 core.Base: isConfig() => only reactive keys"
- 2025-07-03T01:35:52Z @tobiu referenced in commit `a9ad03f` - "#6935 core.Base: -testing log"
- 2025-07-03T02:13:17Z @tobiu referenced in commit `3d433d1` - "#6935 core.Base: construct() => find all real configs"
- 2025-07-03T14:25:40Z @tobiu referenced in commit `bc57c11` - "#6935 core.Base: construct() => meaningful JSDoc comment"
- 2025-07-03T14:28:37Z @tobiu referenced in commit `1931a2f` - "#6935 core.Base: construct() => meaningful JSDoc comment => inheritance for reactive configs"
- 2025-07-03T14:37:33Z @tobiu referenced in commit `b7a84bc` - "#6935 core.Base: construct() => meaningful JSDoc comment => polishing"
- 2025-07-03T15:29:25Z @tobiu referenced in commit `ad3e417` - "#6935 core.Base: experimenting with lazy Config initialization"
- 2025-07-03T15:50:01Z @tobiu referenced in commit `4524cee` - "#6935 cleanup"
- 2025-07-03T18:31:23Z @tobiu referenced in commit `6de0e57` - "#6935 core/Config: cleanup"
- 2025-07-03T19:33:05Z @tobiu referenced in commit `fd7995c` - "#6935 core/Config: set() => return a boolean, if there was a change, Neo.mjs: set() rely on the boolean for triggering afterSet*"
- 2025-07-03T19:44:33Z @tobiu referenced in commit `41dc48e` - "#6935 added the feature request to the feature branch for further refinement. note: must be removed before merging to dev."
- 2025-07-03T19:45:44Z @tobiu referenced in commit `6e3188b` - "#6935 .md file: add the latest version of core.Config"
- 2025-07-03T19:49:34Z @tobiu referenced in commit `5502d54` - "#6935 .md file: lazy initialization"
- 2025-07-03T21:44:14Z @tobiu referenced in commit `7012901` - "#6935 core.Base: most elegant solution for assigning ids first."
- 2025-07-03T23:00:22Z @tobiu referenced in commit `b15ff77` - "#6935 layout.Card: loadModule() => tmp parentId fix"
- 2025-07-03T23:00:36Z @tobiu referenced in commit `aee064e` - "#6935 feature request update"
- 2025-07-03T23:12:44Z @tobiu referenced in commit `3fa94f4` - "#6935 container.Base: ensuring lazy-loaded items get parentId & parentIndex"
- 2025-07-03T23:17:30Z @tobiu referenced in commit `f9a705d` - "#6935 container.Base: re-adding mergeConfig()"
- 2025-07-03T23:23:54Z @tobiu referenced in commit `6f89e5b` - "#6935 Portal.view.learn.MainContainerController: default route fix"
- 2025-07-04T12:06:47Z @tobiu referenced in commit `5420391` - "Enhanced Method Sequencing #6935 initial concept exploration"
- 2025-07-04T12:06:48Z @tobiu referenced in commit `7304052` - "#6935 converted core.Compare and core.Util into non neo classes"
- 2025-07-04T12:06:48Z @tobiu referenced in commit `9a0613c` - "#6935 Neo.mjs: applying _configName to class prototypes as well"
- 2025-07-04T12:06:48Z @tobiu referenced in commit `3ecb6fc` - "#6935 initial debugging, trying to get examples/button/base running inside the browser"
- 2025-07-04T12:06:48Z @tobiu referenced in commit `5843c32` - "#6935 further testing, brainstorming, debugging"
- 2025-07-04T12:06:48Z @tobiu referenced in commit `d9476f2` - "#6935 concept exploration"

