# Deep Dive: Named vs. Anonymous State - A New Era of Component Reactivity

In the main article of our series, we explored the "heartbreak" of modern frontend development: the constant battle against the main thread, the tedious "memoization tax," and the architectural nightmares of complex state management. These are not isolated issues; they are symptoms of a foundational problem in how mainstream frameworks handle reactivity.

Welcome to the first deep dive into the architecture of Neo.mjs v10. In this article, we're going to dissect the engine that makes the old problems obsolete: the new **Effect-Based Reactivity System**. This isn't just a new feature; it's a new reality for how you can write and reason about your application's state and rendering logic.

## Act I: The Legacy - Reactivity is Not New to Neo.mjs

Unlike many frameworks, Neo.mjs has *always* had a reactive config system. Since its earliest versions, you could take a component instance and change its properties directly, and the UI would update automatically.

```javascript
// This has always worked in Neo.mjs
const myButton = Neo.get('my-button');
myButton.text = 'Click me now!'; // The button's text in the DOM updates
```

This was powered by a robust system of prototype-based getters and setters with `afterSet` hooks. It was simple, effective, and already a step beyond the prop-based immutability of frameworks like React. But for v10, we asked a simple question: what if we could take this convenience and put a super-charged, universally observable engine underneath it?

## Act II: The v10 Upgrade - Introducing the Atomic Engine

The v10 release completely rebuilt the engine that powers this system. We introduced a set of core primitives (`Neo.core.Config`, `Neo.core.Effect`, `Neo.core.EffectManager`) that form a new, hyper-performant reactive foundation.

Now, when you define a config with a trailing underscore (e.g., `text_`), the framework automatically wires it into this new engine. The simple, direct API (`myButton.text = '...'`) remains the same, but it's now triggering a system of "Config Atoms." Every config property is now an observable, atomic unit of state that can be tracked by reactive effects.

This upgrade set the stage for a revolutionary new way to think about component state.

## Act III: The Breakthrough - A Tale of Two States

With this new atomic engine in place, we could design a functional component model that solves one of the biggest architectural challenges in modern UI development: the ambiguity between a component's public API and its private state.

This is best explained with a simple component:

```javascript
import {defineComponent, useConfig, useEvent} from 'neo.mjs';

export default defineComponent({
    // 1. The Public API
    config: {
        className: 'My.Component',
        greeting_: 'Hello' // This is a NAMED config
    },

    // 2. The Implementation
    createVdom(config) {
        // 3. The Private State
        const [name, setName] = useConfig('World'); // This is an ANONYMOUS config

        useEvent('click', () => setName(prev => prev === 'Neo' ? 'World' : 'Neo'));

        return {
            // 4. The Synergy
            text: `${config.greeting}, ${name}!`
        }
    }
});
```

This small component demonstrates a paradigm that is likely unfamiliar to developers coming from other frameworks. Let's break it down.

#### 1. Named Configs: The Public, Mutable API

The `greeting_` property is a **Named Config**. It is defined inside the `static config` block. Think of it as the component's public-facing API.

*   **It's like props:** A parent component can provide an initial value for `greeting` when creating an instance.
*   **It's NOT like props:** It is fully reactive and **directly mutable** from the outside.

Another component, or you directly in the browser console, can do this:

```javascript
const myComponent = Neo.get('my-component-id');

// Directly change the public API. The component will instantly re-render.
myComponent.greeting = 'Welcome';
```

This is a paradigm shift. It's not "props drilling" or complex state management. It's a direct, observable, and reactive contract with the component.

#### 2. Anonymous Configs: The Private, Encapsulated State

The `const [name, setName] = useConfig('World')` line creates an **Anonymous Config**.

*   **It's like `useState`:** It manages a piece of state that is completely private and encapsulated within the component.
*   **It's NOT controllable from the outside:** No parent component or external code can see or modify the `name` state. It can only be changed via the `setName` function.

#### 3. The Synergy: Effortless Composition

The magic happens inside the `createVdom` method. This single function, which is wrapped in a master `Neo.core.Effect`, seamlessly reads from both state types:

*   It accesses the public API via the `config` parameter: `config.greeting`.
*   It accesses the private state directly from the hook's return value: `name`.

Because both `config.greeting` (a Named Config) and `name` (an Anonymous Config) are powered by the same atomic `Neo.core.Config` engine, the master `vdomEffect` automatically tracks them both as dependencies.

If *either* an external force changes the public API (`myComponent.greeting = '...'`) or an internal event changes the private state (`setName('Neo')`), the component's `vdomEffect` will re-run, and the UI will be updated surgically.

### Conclusion: Why This Changes Everything

This "Tale of Two States" is more than just a new API; it's a solution to fundamental problems in component architecture.

1.  **It creates clear boundaries:** The `config` block is your component's formal, public API. `useConfig` is its private implementation detail. This clarity makes components easier to understand, use, and maintain.
2.  **It eliminates props drilling:** A parent doesn't need to pass down callbacks to change a child's state. It can modify the child's public, named configs directly if the architecture calls for it.
3.  **It is performant by default:** Because the reactivity is automatic and precise, the entire ecosystem of manual memoization (`useMemo`, `useCallback`, `React.memo`) is rendered obsolete. You get optimal performance out-of-the-box, without the boilerplate and without the bugs.

This is the new reality of reactivity in Neo.mjs v10. It's a system designed for clarity, power, and performance, allowing you to fall in love with building, not fighting, your components.

---

## Under the Hood: The Atomic Engine

For those who want to go deeper, let's look at the core primitives that make this all possible. The entire v10 reactivity system is built on a foundation of three simple, powerful classes.

### `Neo.core.Config`: The Observable Box
[[Source]](https://github.com/neomjs/neo/blob/dev/src/core/Config.mjs)

At the very bottom of the stack is `Neo.core.Config`. You can think of this as an "observable box." It's a lightweight container that holds a single value. Its only jobs are to hold that value and to notify a list of subscribers whenever the value changes. It knows nothing about components, the DOM, or anything else.

### `Neo.core.Effect`: The Reactive Function
[[Source]](https://github.com/neomjs/neo/blob/dev/src/core/Effect.mjs)

An `Effect` is a function that automatically tracks its dependencies. When you create an `Effect`, you give it a function to run. As that function runs, any `Neo.core.Config` instance whose value it reads will automatically register itself as a dependency of that `Effect`.

If any of those dependencies change in the future, the `Effect` automatically re-runs its function. It's a self-managing subscription that forms the basis of all reactivity in the framework.

### `Neo.core.EffectManager`: The Orchestrator
[[Source]](https://github.com/neomjs/neo/blob/dev/src/core/EffectManager.mjs)

This is the central singleton that makes the magic happen. The `EffectManager` keeps track of which `Effect` is currently running. When a `Config` instance is read, it asks the `EffectManager`, "Who is watching me right now?" and adds the current `Effect` to its list of subscribers.

Crucially, the `EffectManager` also provides the ability to batch updates (`Neo.batch`). This ensures that if you change ten different `Config` values in a single, synchronous operation, all dependent `Effect`s will only run *once* at the very end, with the final, consistent state.

### Tying It All Together

When you define a component, the framework connects these pieces for you:

1.  Every reactive config (both **Named** like `greeting_` and **Anonymous** via `useConfig`) is backed by its own `Neo.core.Config` instance.
2.  Your entire `createVdom` function is wrapped in a single, master `Neo.core.Effect`.
3.  When `createVdom` runs, it reads from various `Config` instances, and the `EffectManager` ensures they are all registered as dependencies of the master `Effect`.
4.  When any of those configs change, the master `Effect` re-runs, your `createVdom` is executed again, and the UI updates.

This elegant, layered architecture is what provides the power and performance of the v10 reactivity system, delivering a developer experience that is both simple on the surface and incredibly robust underneath.