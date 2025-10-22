---
id: 7084
title: >-
  Feature Request: Introduce `beforeUpdate()` Lifecycle Hook for Functional
  Components
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-19T15:24:46Z'
updatedAt: '2025-07-19T15:25:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7084'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-19T15:25:38Z'
---
# Feature Request: Introduce `beforeUpdate()` Lifecycle Hook for Functional Components

**Reported by:** @tobiu on 2025-07-19

## Summary

This ticket proposes the addition of a new `beforeUpdate()` lifecycle method to `Neo.functional.component.Base`. This hook will be executed after all state changes from a reactive `Effect` have been processed and just before the `updateVdom()` method is called.

This provides a predictable entry point for developers to run pre-render logic, and adds the advanced capability to conditionally cancel a VDOM update.

## Problem & Motivation

Currently, functional components lack a formal lifecycle hook for running logic immediately before a re-render is dispatched. This forces developers to place pre-render computations—such as deriving data from state, filtering lists, or formatting values—directly inside the `createVdom()` method.

This approach has two main drawbacks:
1.  **Clutters Rendering Logic:** It mixes business logic with the component's structural definition, making the `createVdom()` method harder to read and maintain.
2.  **No Update Control:** There is no mechanism to prevent a VDOM update from occurring, even if derived state indicates that a render is unnecessary, leading to potentially redundant work.

## Proposed Solution

We will introduce a new, overridable method on `Neo.functional.component.Base`.

This method will be invoked within the `onEffectRunStateChange()` handler, immediately preceding the `me.updateVdom()` call. Crucially, if `beforeUpdate()` returns `false`, the `updateVdom()` call will be skipped.

### JSDoc & Signature

```javascript
/**
 * A lifecycle hook that runs after a state change has been detected but before the
 * VDOM update is dispatched. It provides a dedicated place for logic that needs to
 * execute before rendering, such as calculating derived data or caching values.
 *
 * You can prevent the VDOM update by returning `false` from this method. This is
 * useful for advanced cases where you might want to manually trigger a different
 * update after modifying other component configs.
 *
 * **IMPORTANT**: Do not change the value of any config that is used as a dependency
 * within the `createVdom` method from inside this hook, as it will cause an
 * infinite update loop. This hook is for one-way data flow, not for triggering
 * cascading reactive changes.
 *
 * @returns {Boolean|undefined} Return `false` to cancel the upcoming VDOM update.
 */
beforeUpdate() {
    // This method can be overridden by subclasses
}
```

## Benefits

1.  **Improved Code Organization:** Provides a dedicated place for pre-render logic, cleanly separating it from VDOM creation.
2.  **Performance Optimization:** Allows developers to perform expensive computations once per update cycle and cache the results on the component instance.
3.  **Advanced Update Control:** Gives developers the power to prevent unnecessary re-renders, for example, when input data changes but the resulting view does not.
4.  **Enhanced Lifecycle Clarity:** Establishes a more formal and predictable component lifecycle, making functional components more robust and easier to reason about.

## Advanced Usage & Important Warnings

The ability to cancel an update is powerful, but it requires careful use.

### Anti-Pattern: Infinite Loops
The most critical rule is to **never modify a reactive config that is a dependency of `createVdom()` from within `beforeUpdate()`**. Doing so will create an infinite loop:
1. A config changes.
2. The `createVdom` effect runs.
3. `onEffectRunStateChange` is triggered.
4. `beforeUpdate` is called.
5. `beforeUpdate` changes the same config again.
6. Go back to step 2.

### Correct Usage Example

This example shows how to calculate derived data and conditionally cancel an update if the view would not change.

```javascript
import { defineComponent } from '../../../src/functional/_export.mjs';

export default defineComponent({
    config: {
        users: [],
        filterTerm: ''
    },
    
    beforeUpdate() {
        // 1. Compute derived data and cache it on the instance
        this.filteredUsers = this.users?.filter(
            user => user.name.toLowerCase().includes(this.filterTerm.toLowerCase())
        ) ?? [];

        // 2. Conditionally cancel the update
        // If the new list of users is identical to the one already rendered,
        // there is no need to call updateVdom().
        const currentRenderedCount = this.vdom.cn?.length ?? 0;
        if (this.filteredUsers.length === 0 && currentRenderedCount === 0) {
            return false; // Don't re-render if the list is empty and was already empty
        }
    },

    createVdom() {
        // The createVdom method is now clean and focused on structure,
        // using the pre-computed data.
        return {
            tag: 'ul',
            cn: this.filteredUsers.map(user => ({
                tag: 'li',
                key: user.id,
                text: user.name
            }))
        };
    }
});
```

