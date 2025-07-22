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

The `greeting_` property is a **Named Config**. It is defined inside the `static config` block. (The trailing underscore is the Neo.mjs convention to automatically generate a reactive getter and setter for a public property named `greeting`.) Think of it as the component's public-facing API.

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
*   **It's NOT controllable from the outside:** No parent component or external code can see or modify the `name` state. As shown in the example, it can only be changed via the `setName` function, which is called by the component's own internal logic (like the `useEvent` hook).

#### 3. The Synergy: Effortless Composition

The magic happens inside the `createVdom` method. This single function, which is wrapped in a master `Neo.core.Effect`, seamlessly reads from both state types:

*   It accesses the public API via the `config` parameter. This object is a reactive proxy to the component's public API. When the `vdomEffect` runs, simply accessing `config.greeting` is enough to register the public `greeting_` property as a dependency.
*   It accesses the private state directly from the hook's return value: `name`.

Because both `config.greeting` (a Named Config) and `name` (an Anonymous Config) are powered by the same atomic `Neo.core.Config` engine, the master `vdomEffect` automatically tracks them both as dependencies.

If *either* an external force changes the public API (`myComponent.greeting = '...'`) or an internal event changes the private state (`setName('Neo')`), the component's `vdomEffect` will re-run, and the UI will be updated surgically.

### Conclusion: The Best of Both Worlds

This "Tale of Two States" is more than just a new API; it's the foundation for a paradigm that solves the most frustrating parts of modern frontend development. It delivers a developer experience that feels both radically simple and incredibly powerful, resolving the long-standing conflict between mutability and predictability.

**1. Your State is Mutable by Design.**
In Neo.mjs, you are encouraged to work with state in the most natural way possible: direct mutation. There are no
immutable data structures to learn, no spread operators to remember, and no `setState(prev => ...)` gymnastics.
You treat your component and its VDOM as living, mutable objects.

```javascript
// This is not just allowed, it's the recommended way.
myComponent.text = 'New Title';
myComponent.vdom.cn.push({ tag: 'p', text: 'New paragraph' });
myComponent.update(); // Trigger the update process
```

**2. The Update Process is Immutable by Default.**
Herein lies the magic. The moment you trigger an update, the framework takes a complete, serializable snapshot of your component's current `vdom` and `vnode`. This JSON snapshot is, by its nature, an immutable copy. It's this frozen-in-time representation that gets sent to the VDOM Worker for diffing.

**The Result: A Mutability Paradox.**
You get the best of both worlds, without compromise:

*   **A Simple, Mutable Developer Experience:** You work with plain JavaScript objects and change them directly. The framework doesn't force you into an unnatural, immutable style.
*   **A Safe, Immutable Update Pipeline:** The VDOM worker operates on a predictable, isolated snapshot, ensuring that rendering is always consistent and free from race conditions.

Because of this architecture, you are free to continue mutating the component's state in the App Worker *even while a VDOM update is in flight*. The framework handles the queueing and ensures the next update will simply capture the new state.

This is why the entire ecosystem of manual memoization (`useMemo`, `useCallback`, `React.memo`) is rendered obsolete. The architecture is **performant by default** because it gives you the developer ergonomics of direct mutation while leveraging the performance and safety of an immutable, off-thread rendering process.

This is the new reality of reactivity in Neo.mjs v10. It's a system designed to let you fall in love with building, not fighting, your components.

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

### The Next Level: Mutable State, Immutable Updates

This is where the Neo.mjs reactivity model takes a significant leap beyond other frameworks. It's an architecture that provides the intuitive ergonomics of direct mutation with the safety and performance of an immutable pipeline.

#### Synchronous State, Asynchronous DOM

First, a crucial distinction. The core `Effect` system within the App Worker runs **synchronously**, and it's built on a principle of **atomic batching**. When you use a method like `myComponent.set({...})`, the framework automatically wraps all state changes in a single batch. The `EffectManager` pauses execution, queues all triggered effects, and then runs them exactly once, synchronously, after the batch is complete. This guarantees that all dependent reactive values *within the App Worker* are updated immediately and consistently in the same turn of the event loop, with no "waiting for the next tick" to know the state of your application logic.

However, the process of updating the actual DOM is **asynchronous**. It has to be. A call to `myComponent.update()` or a change to a reactive config kicks off the "triangular worker communication":

1.  **App Worker → VDOM Worker:** The App Worker sends a snapshot of the component's `vdom` and previous `vnode` to the VDOM Worker.
2.  **VDOM Worker → Main Thread:** The VDOM Worker calculates the minimal set of changes (deltas) and sends them to the Main Thread.
3.  **Main Thread → App Worker:** The Main Thread applies the deltas to the real DOM and then notifies the App Worker that the update is complete, resolving any promises associated with the update.

#### The Immutable Snapshot: The Key to the Paradox

The genius of this model lies in how the App Worker communicates with the VDOM Worker. It doesn't send a live, mutable object. Instead, it creates a deep, JSON-serializable **snapshot** of the component's `vdom` tree.

This snapshot is, by its very nature, an **immutable copy**.

This single architectural choice unlocks the entire paradigm:

*   **Developer Freedom:** As a developer in the App Worker, you are free to mutate your component's state and VDOM at any time. You can change a property, push a new child into the `vdom.cn` array, and then immediately change another property.
*   **Pipeline Safety:** The VDOM worker receives a clean, predictable, "frozen-in-time" version of the UI to work with. It is completely isolated from any mutations that might be happening back in the App Worker while it's calculating the diff.

This completely eliminates the need for developers to manage immutability. You get a developer experience that is fundamentally simpler and more aligned with how JavaScript objects naturally work, while the framework ensures the update process is as safe and predictable as in the most rigidly immutable systems.

### Tying It All Together

When you define a component, the framework connects these pieces for you:

1.  Every reactive config (both **Named** like `greeting_` and **Anonymous** via `useConfig`) is backed by its own `Neo.core.Config` instance.
2.  Your entire `createVdom` function is wrapped in a single, master `Neo.core.Effect`.
3.  When `createVdom` runs, it reads from various `Config` instances, and the `EffectManager` ensures they are all registered as dependencies of the master `Effect`.
4.  When any of those configs change, the master `Effect` re-runs, your `createVdom` is executed again, and the UI updates.

This elegant, layered architecture is what provides the power and performance of the v10 reactivity system, delivering a developer experience that is both simple on the surface and incredibly robust underneath.
