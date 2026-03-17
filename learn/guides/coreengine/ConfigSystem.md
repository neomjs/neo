# The Config System & Circular Dependencies

Neo.mjs implements a powerful, declarative configuration system. It provides structure, predictability, and automatic reactivity to class properties.

## The Trailing Underscore Convention

The core mechanism for defining a reactive property is adding a trailing underscore to its name within the `static config` block:

```javascript readonly
class MyComponent extends Base {
    static config = {
        // Non-reactive (applied directly to prototype)
        className: 'MyApp.MyComponent',
        
        // Reactive (framework generates getter/setter and hooks)
        title_: 'Default Title',
        isActive_: false
    }
}
```

During the `Neo.setupClass` compilation phase, the framework strips the underscore and generates public getters and setters (`this.title`, `this.isActive`).

## Lifecycle Hooks

When you assign a new value to a reactive config (`this.title = 'New Title'`), the generated setter automatically triggers a sequence of optional lifecycle hooks:

1. **`beforeSetTitle(value, oldValue)`**: Runs *before* the value is applied. Useful for validation or data transformation. Returning `undefined` from this hook cancels the update.
2. **`afterSetTitle(value, oldValue)`**: Runs *after* the value is successfully applied. This is where you trigger side effects (e.g., updating the DOM or fetching new data).

### The `undefined` Sentinel Value

In Neo.mjs, `undefined` is a strict sentinel value indicating "initial instantiation".

When a component is created, its `afterSet` hooks will fire for the very first time. In this initial execution, the `oldValue` argument will *always* be exactly `undefined`.

```javascript readonly
afterSetTitle(value, oldValue) {
    if (oldValue !== undefined) {
        // This logic will ONLY run on subsequent updates,
        // skipping the initial setup phase.
        this.updateDom();
    }
}
```

Because of this specific meaning, **you should never set a config to `undefined` after it has been initialized.** If you need to clear a value, use `null`.

## Solving Circular Dependencies (The `configSymbol`)

A common challenge in complex UI frameworks is managing circular dependencies during batch updates.

Imagine setting two configs at the same time:
```javascript readonly
this.set({
    width : 200,
    height: 300
});
```

What if `beforeSetWidth` needs to read `this.height`, but `height` hasn't been updated yet? Or what if updating `width` triggers a recalculation that inadvertently triggers another `set` on `height`?

### The Temporary Holding Zone

`src/core/Base.mjs` solves this using a `configSymbol` (a hidden ES6 `Symbol` property on the instance) as a temporary holding zone.

When `this.set()` is called:
1. All new reactive values are placed into `this[configSymbol]`.
2. The framework then begins processing them one by one.
3. Because the generated *getter* checks `this[configSymbol]` before checking the actual internal backing property, any hook (e.g., `beforeSetWidth`) will immediately receive the *new, pending* value for `height`, even if `height` hasn't fully processed its own `beforeSet/afterSet` cycle yet.

This guarantees that during a batch `set()`, all hooks operate against the "future state" of the instance, eliminating timing bugs and resolving circular read dependencies.

### The Immutable Batch

Furthermore, the `set()` method is wrapped in `EffectManager.pause()` and `EffectManager.resume()`. This ensures that if the configs are part of a broader, pull-based dependency graph, the graph is not re-evaluated until the entire batch operation is complete and consistent.