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
        this.update();
    }
}
```

Because of this specific meaning, **you should never set a config to `undefined` after it has been initialized.** If you need to clear a value, use `null`.

## Solving Circular Dependencies (The `configSymbol`)

A common challenge in complex UI frameworks is managing circular or cross-dependent configurations during batch updates.

Imagine setting two configs at the same time where the update logic of one depends on the new value of the other.

### The Temporary Holding Zone

`src/core/Base.mjs` solves this using a `configSymbol` (a hidden ES6 `Symbol` property on the instance) as a temporary holding zone.

When `this.set()` is called with multiple properties, all new reactive values are placed into `this[configSymbol]`. The framework then processes them sequentially. Because the generated *getter* for any reactive config checks `this[configSymbol]` before checking the internal backing property, any hook will immediately receive the *new, pending* value, even if that property hasn't fully processed its own `beforeSet`/`afterSet` cycle yet.

### Example: Cross-Dependent Configs

Consider this simplified example based on `Neo.examples.core.config.MainContainer`:

```javascript live-preview
import Base from '../core/Base.mjs';

class MathComponent extends Base {
    static config = {
        className: 'MathComponent',
        a_: null,
        b_: null
    }

    afterSetA(value, oldValue) {
        if (oldValue !== undefined) {
            // Even though `afterSetA` might run before `b` has finished its setter,
            // `this.b` will correctly return the NEW value passed in the set() block.
            console.log(`afterSetA: a + b = ${value + this.b}`);
        }
    }

    afterSetB(value, oldValue) {
        if (oldValue !== undefined) {
            console.log(`afterSetB: b + a = ${value + this.a}`);
        }
    }
}

let comp = Neo.create(MathComponent);

// Trigger a batch update
comp.set({
    a: 5,
    b: 5
});

// Console Output:
// afterSetA: a + b = 10
// afterSetB: b + a = 10
```

Without the `configSymbol` buffering these values, when `afterSetA` runs, `this.b` would still be `null`, resulting in a broken calculation. This mechanism guarantees that during a batch `set()`, all hooks operate against the "future state" of the instance, eliminating timing bugs and resolving circular read dependencies.

### The Immutable Batch

Furthermore, the `set()` method is wrapped in `EffectManager.pause()` and `EffectManager.resume()`. This ensures that if the configs are part of a broader, pull-based dependency graph, the graph is not re-evaluated until the entire batch operation is complete and consistent.