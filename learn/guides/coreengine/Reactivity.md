# Two-Tier Reactivity (Effects vs Hooks)

A key architectural advantage of Neo.mjs is that it does not force developers into a single, "one-size-fits-all" reactivity model. 

Frameworks often struggle because they try to solve two different problems with the same tool:
1. **Local, imperative side-effects:** ("When I click this specific button, change its color.")
2. **Global, derived state:** ("When the user's currency preference changes, update the total price calculation across 5 different views.")

Neo.mjs provides two distinct reactivity systems tailored for these use cases: Push-Based Hooks and Pull-Based Effects.

## Tier 1: Push-Based (Lifecycle Hooks)

This is the classic, localized reactivity model powered by the `core.Config` system (the `trailing_underscore_` convention).

It is **push-based** because a change to a property explicitly *pushes* an update through a predefined sequence of methods (`beforeSet` -> `afterSet`).

### When to use it
* Component-level state management.
* Validating input data before it is applied (`beforeSet`).
* Triggering direct DOM updates or side-effects when a specific property changes.

```javascript readonly
class MyButton extends Component {
    static config = {
        // Reactive config
        isActive_: false
    }

    // Push-based side effect
    afterSetIsActive(value, oldValue) {
        if (oldValue !== undefined) {
            // Imperatively update the VDOM based on the new value
            this.updateCls('active', value);
        }
    }
}
```

## Tier 2: Pull-Based (Effects & Dependency Tracking)

For complex, application-wide state, manual `afterSet` hooks become difficult to trace. If `A` changes, it updates `B`, which updates `C`. This leads to "spaghetti state."

To solve this, Neo.mjs provides a **pull-based** dependency tracking system via `src/core/Effect.mjs` and `src/core/EffectManager.mjs`.

### How it works
Instead of explicitly defining *when* something should update, you define *what* it depends on via a function. The `EffectManager` automatically tracks any reactive config accessed during the function's execution. When any of those tracked configs change, the effect is automatically re-run.

### When to use it
* Complex calculations derived from multiple state sources.
* Synchronizing application-level state (via `Neo.state.Provider`) across multiple components.

```javascript readonly
import Effect from './core/Effect.mjs';

// Assume we have a state provider with values
let sum = 0;

// The effect automatically registers dependencies.
// If state.a or state.b changes, this function re-runs automatically.
let myEffect = Neo.create(Effect, {
    fn: () => {
        sum = state.a + state.b;
    }
});
```

### The Synergy
The magic of Neo.mjs is that these two systems are fully integrated. The reactive configs created by `Neo.setupClass` (Tier 1) are the exact same observable data sources that `EffectManager` tracks (Tier 2). 

You can use explicit hooks for precise component rendering, and automated Effects for complex business logic, allowing for optimal performance and clean architecture.