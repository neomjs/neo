# Core Utilities

To power an engine capable of processing 40,000 VDOM delta updates per second across multiple worker threads, the sophisticated core engine we've explored must be built on a foundation of absolute efficiency. It's not enough to be reactive; the engine must know exactly when *not* to do work.

The Neo.mjs core includes several low-level utilities designed to protect the system from unnecessary computation and manage chaotic inputs declaratively.

## The Verification Engine: `core.Compare`

At the heart of the Config System is the ability to determine if a value has *actually* changed. If an engine re-renders or fires events when data hasn't genuinely mutated, performance degrades rapidly.

Neo.mjs uses a custom, highly optimized deep comparison engine located at `src/core/Compare.mjs`.

### `Neo.isEqual(a, b)`

This utility is the gatekeeper for the entire reactivity model. It is used extensively by the `core.Config` system to verify if a `set()` operation should trigger an `afterSet` hook. 

It is specifically designed for the performance characteristics of modern V8 engines, avoiding the overhead of heavy external libraries:
* It handles primitive types rapidly.
* It performs deep equality checks on plain Objects and Arrays.
* It correctly handles edge cases like `NaN`, `Date` objects, and `RegExp`.
* Crucially, it safely ignores complex class instances (like nested Neo components) during deep object comparisons to prevent infinite recursion and stack overflows.

## Declarative Method Modifiers: `delayable`

Even with efficient comparison, UI applications are subject to chaotic user input. Rapid scroll events, continuous window resizing, or fast keystrokes in a search field can flood the reactivity system if left unchecked.

Instead of requiring developers to manually wrap functions in timeouts, `core.Base.mjs` provides a declarative `delayable` static configuration to tame this input.

### How it works

You can define which methods should be delayed directly in the class configuration. During the `construct()` phase, the core engine automatically wraps these methods using highly optimized utilities from `src/util/Function.mjs`.

```javascript readonly
class MySearchField extends TextField {
    static delayable = {
        // Automatically debounce the search method
        triggerSearch: {
            type : 'debounce',
            timer: 300 // wait 300ms after the last call before executing
        },
        // Automatically throttle a scroll handler
        onScroll: {
            type : 'throttle',
            timer: 16 // execute at most once every 16ms (approx 60fps)
        }
    }

    triggerSearch() {
        // This business logic will only run after the user stops typing for 300ms.
        console.log('Searching for:', this.value);
    }
}
```

This declarative approach keeps the business logic (`triggerSearch`) completely clean and separate from the timing logic, while ensuring the engine is never overwhelmed.

## Eventing: `core.Observable`

While the Config system handles continuous state changes, discrete events (like a user clicking a button, or a network request failing) are handled by the `Neo.core.Observable` mixin.

This mixin provides the standard `on()`, `un()`, and `fire()` methods for custom event emission. 

Because `Neo.setupClass` intelligently handles mixins, if a class simply sets `static observable = true`, the compiler automatically injects the `core.Observable` capabilities into the instance. For a deeper dive into the event system, see the dedicated [Events Guide](../userinteraction/events/CustomEvents.md).

---

The Neo.mjs Core Engine is far more than a wrapper around JavaScript classes. It is a meticulously designed pipeline. From bypassing the constructor trap with `construct()`, to forging unified blueprints with `setupClass`, managing complex state through the Config System and Effect tracking, ensuring cross-thread readiness via `initAsync`, and guarding performance with low-level utilities. Together, these systems form the robust foundation that makes Neo's high-performance, multi-threaded architecture possible.