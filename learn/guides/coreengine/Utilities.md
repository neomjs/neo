# Core Utilities

The Neo.mjs core engine includes several built-in utilities that operate at the lowest level of the framework, ensuring high performance and providing declarative convenience for common patterns.

## The Verification Engine: `core.Compare`

At the heart of any reactive system is the ability to determine if a value has *actually* changed. If a framework re-renders or fires events when data hasn't changed, performance degrades rapidly.

Neo.mjs uses a custom, highly optimized deep comparison engine located at `src/core/Compare.mjs`.

### `Neo.isEqual(a, b)`

This utility is used extensively by the `core.Config` system to verify if a `set()` operation should trigger an `afterSet` hook.

It is specifically designed for the performance characteristics of modern V8 engines:
* It handles primitive types rapidly.
* It performs deep equality checks on plain Objects and Arrays.
* It correctly handles edge cases like `NaN`, `Date` objects, and `RegExp`.
* It safely ignores complex class instances (like Neo components) during deep object comparisons to prevent infinite recursion and stack overflows.

## Declarative Method Modifiers: `delayable`

Throttling and debouncing methods is a common requirement in UI development (e.g., handling rapid scroll events or keystrokes in a search field).

Instead of requiring developers to manually wrap functions, `core.Base.mjs` provides a declarative `delayable` static configuration.

### How it works

You can define which methods should be delayed directly in the class configuration. During instantiation, the core engine automatically wraps these methods using utilities from `src/util/Function.mjs`.

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
        // This will only run after the user stops typing for 300ms
        console.log('Searching for:', this.value);
    }
}
```

This declarative approach keeps the business logic (`triggerSearch`) clean and separate from the timing logic.

## Eventing: `core.Observable`

While the Config system handles state changes, discrete events (like a user clicking a button or a network request failing) are handled by the `Neo.core.Observable` mixin.

This mixin provides the standard `on()`, `un()`, and `fire()` methods for custom event emission. 

If a class sets `static observable = true`, `Neo.setupClass` automatically applies the `core.Observable` mixin to it. 

For a deeper dive into the event system, see the dedicated [Events Guide](../userinteraction/events/CustomEvents.md).