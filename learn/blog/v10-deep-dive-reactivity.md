# Deep Dive: Named vs. Anonymous State - A New Era of Component Reactivity

In the main article of our series, we explored the "heartbreak" of modern frontend development: the constant battle
against the main thread, the tedious "memoization tax," and the architectural nightmares of complex state management.
These are not isolated issues; they are symptoms of a foundational problem in how mainstream frameworks handle reactivity.

Welcome to the first deep dive into the architecture of Neo.mjs v10. In this article, we're going to dissect the engine
that makes the old problems obsolete: **The Two-Tier Reactivity System**. This is a revolutionary approach that
seamlessly unifies two powerful paradigms—a classic "push" system and a modern "pull" system—into one elegant
developer experience. This isn't just a new feature; it's a new reality for how you can write and reason about your
application's state and rendering logic.

## Act I: Tier 1 - The Classic "Push" System

Unlike many frameworks, Neo.mjs has *always* had a reactive config system. Since its earliest versions, you could take a
component instance and change its properties directly, and the UI would update automatically.

```javascript
// This has always worked in Neo.mjs
const myButton = Neo.get('my-button');
myButton.text = 'Click me now!'; // The button's text in the DOM updates
```

This has always been powered by a robust system of prototype-based getters and setters.
For any reactive **Named Config** (e.g., `text_`), the framework provides three optional lifecycle hooks that you can
implement to hook into its lifecycle:

*   `beforeGetText(value)`: Run just before a value is read.
*   `beforeSetText(value, oldValue)`: Run before a new value is set, allowing for validation or transformation.
*   `afterSetText(value, oldValue)`: Run after a value has been successfully changed, perfect for triggering side effects.

This powerful, hook-based API is an imperative, **"push-based"** system. Think of it like a **manual phone tree**: when a
config changes, your `afterSet` hook is responsible for explicitly "calling" all the other parts of the component
that need to know about the change. It offers precise, granular control, but it means you are manually managing the
dependency graph.

For v10, we didn't replace this system—we super-charged it. We asked: what if we could add a second, fully automatic
tier to this foundation?

## Act II: Tier 2 - The Modern "Pull" System

The v10 release introduces the second tier: a declarative, **"pull-based"** system. Think of it like a **subscription
service**: you "subscribe" to a piece of state simply by reading it. When that state changes, the framework automatically
notifies all subscribers. You no longer manage the dependency graph—the framework does it for you.

This is powered by a new set of core primitives (`Neo.core.Config`, `Neo.core.Effect`, `Neo.core.EffectManager`)
that form a hyper-performant reactive foundation.

The true genius of this Two-Tier system is how they are seamlessly bridged together. Think of it like a **universal
power adapter**: you use a simple, familiar plug (`myButton.text = '...'`), and the adapter transparently handles
powering both systems at once.

When you define a a config with a trailing underscore (e.g., `text_`), the generated setter becomes this adapter. It
simultaneously:

1.  **Powers Tier 2 ("Pull"):** It updates the underlying `Neo.core.Config` atom, automatically triggering any dependent effects.
2.  **Powers Tier 1 ("Push"):** It calls the classic `afterSetText()` hook, allowing for explicit, imperative logic.

This means every config property is now an observable, atomic unit of state that works with both paradigms, giving you
the best of both worlds without any extra effort.

This upgrade set the stage for a revolutionary new way to think about component state.

## Act III: The Breakthrough - A Tale of Two States

The true power of the **Two-Tier Reactivity System** is not just that the two tiers exist, but how they work together.
With this unified engine in place, we could design a functional component model that solves one of the biggest
architectural challenges in modern UI development: the ambiguity between a component's public API and its private state.

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

This small component demonstrates a paradigm that is likely unfamiliar to developers coming from other frameworks.
Let's break it down.

#### 1. Named Configs: The Public, Mutable API

The `greeting_` property is a **Named Config**. It is defined inside the `static config` block. (The trailing underscore
is the Neo.mjs convention to automatically generate a reactive getter and setter for a public property named `greeting`.)
Think of it as the component's public-facing API.

*   **It's like props:** A parent component can provide an initial value for `greeting` when creating an instance.
*   **It's NOT like props:** It is fully reactive and **directly mutable** from the outside.

Another component, or you directly in the browser console, can do this:

```javascript
const myComponent = Neo.get('my-component-id');

// Directly change the public API. The component will instantly re-render.
myComponent.greeting = 'Welcome';
```

This is a paradigm shift. It's not "props drilling" or complex state management. It's a direct, observable,
and reactive contract with the component.

#### 2. Anonymous Configs: The Private, Encapsulated State

The `const [name, setName] = useConfig('World')` line creates an **Anonymous Config**.

*   **It's like `useState`:** It manages a piece of state that is completely private and encapsulated within the component.
*   **It's NOT controllable from the outside:** No parent component or external code can see or modify the `name` state.
    As shown in the example, it can only be changed via the `setName` function, which is called by the component's own
    internal logic (like the `useEvent` hook).

#### 3. The Synergy: Effortless Composition

The magic happens inside the `createVdom` method. This single function, which is wrapped in a master `Neo.core.Effect`,
seamlessly reads from both state types:

*   It accesses the public API via the `config` parameter. This object is a reactive proxy to the component's public API.
    When the `vdomEffect` runs, simply accessing `config.greeting` is enough to register the public `greeting_` property
    as a dependency.
*   It accesses the private state directly from the hook's return value: `name`.

Because both `config.greeting` (a Named Config) and `name` (an Anonymous Config) are powered by the same atomic
`Neo.core.Config` engine, the master `vdomEffect` automatically tracks them both as dependencies.

If *either* an external force changes the public API (`myComponent.greeting = '...'`) or an internal event changes the
private state (`setName('Neo')`), the component's `vdomEffect` will re-run, and the UI will be updated surgically.

### Conclusion: The Best of Both Worlds

This "Tale of Two States" is more than just a new API; it's the foundation for a paradigm that solves the most
frustrating parts of modern frontend development. It delivers a developer experience that feels both radically simple
and incredibly powerful, resolving the long-standing conflict between mutability and predictability.

**1. Your State is Mutable by Design.**
In Neo.mjs, you are encouraged to work with state in the most natural way possible: direct mutation. The framework
provides several powerful methods to apply these mutations, from changing single properties to batching multiple updates
atomically, or even decoupling state changes from the render cycle entirely.

```javascript
// The recommended way is to mutate a component's public configs.
// The component's internal logic (e.g., an afterSet hook) directly mutates the vdom object, outside any effects.
// This triggers an asynchronous update cycle.
myComponent.text = 'New Title';

// For multiple changes, batch them with .set() for efficiency.
await myComponent.set({
    iconCls: 'fa fa-rocket',
    text   : 'Launch'
});

// Change multiple configs without triggering an update cycle:
myComponent.setSilent({
    iconCls: 'fa fa-cogs',
    text   : 'Settings'
});
// This is a powerful way to e.g. then update its parent, and trigger an aggregated update cycle for both
```

**2. The Update Process is Immutable by Default.**
Herein lies the magic. The moment you trigger an update, the framework takes a complete, serializable snapshot of your
component's current `vdom` and `vnode`. This JSON snapshot is, by its nature, an immutable copy. It's this frozen-in-time
representation that gets sent to the VDOM Worker for diffing.

**The Result: A Mutability Paradox.**
You get the best of both worlds, without compromise:

*   **A Simple, Mutable Developer Experience:** You work with plain JavaScript objects and change them directly.
    The framework doesn't force you into an unnatural, immutable style.
*   **A Safe, Immutable Update Pipeline:** The VDOM worker operates on a predictable, isolated snapshot,
    ensuring that rendering is always consistent and free from race conditions.

Because of this architecture, you are free to continue mutating the component's state in the App Worker *even while a
VDOM update is in flight*. The framework handles the queueing and ensures the next update will simply capture the new state.

This is why the entire ecosystem of manual memoization (`useMemo`, `useCallback`, `React.memo`) is rendered obsolete.
The architecture is **performant by default** because it gives you the developer ergonomics of direct mutation while
leveraging the performance and safety of an immutable, off-thread rendering process.

This is the new reality of reactivity in Neo.mjs v10. It's a system designed to let you fall in love with building,
not fighting, your components.

---

## Under the Hood: The Atomic Engine

For those who want to go deeper, let's look at the core primitives that make this all possible. The entire v10 reactivity
system is built on a foundation of three simple, powerful classes.

### `Neo.core.Config`: The Observable Box
[[Source]](https://github.com/neomjs/neo/blob/dev/src/core/Config.mjs)

At the very bottom of the stack is `Neo.core.Config`. You can think of this as an "observable box." It's a lightweight
container that holds a single value. Its only jobs are to hold that value and to notify a list of subscribers whenever
the value changes. It knows nothing about components, the DOM, or anything else.

### `Neo.core.Effect`: The Reactive Function
[[Source]](https://github.com/neomjs/neo/blob/dev/src/core/Effect.mjs)

An `Effect` is a function that automatically tracks its dependencies. When you create an `Effect`, you give it a function
to run. As that function runs, any `Neo.core.Config` instance whose value it reads will automatically register itself as
a dependency of that `Effect`.

If any of those dependencies change in the future, the `Effect` automatically re-runs its function. It's a self-managing
subscription that forms the basis of all reactivity in the framework.

### `Neo.core.EffectManager`: The Orchestrator
[[Source]](https://github.com/neomjs/neo/blob/dev/src/core/EffectManager.mjs)

This is the central singleton that makes the magic happen. The `EffectManager` keeps track of which `Effect` is currently
running. When a `Config` instance is read, it asks the `EffectManager`, "Who is watching me right now?" and adds the
current `Effect` to its list of subscribers.

### The Next Level: Mutable State, Immutable Updates

This is where the Neo.mjs reactivity model takes a significant leap beyond other frameworks. It's an architecture that
provides the intuitive ergonomics of direct mutation with the safety and performance of an immutable pipeline.

#### Synchronous State, Asynchronous DOM

First, a crucial distinction. The core `Effect` system within the App Worker runs **synchronously**, and it's built on a
principle of **atomic batching**. When you use a method like `myComponent.set({...})`, the framework automatically wraps
all state changes in a single batch. The `EffectManager` pauses execution, queues all triggered effects, and then runs
them exactly once, synchronously, after the batch is complete. This guarantees that all dependent reactive values
*within the App Worker* are updated immediately and consistently in the same turn of the event loop, with no "waiting for
the next tick" to know the state of your application logic.

However, the process of updating the actual DOM is **asynchronous**. It has to be. A call to `myComponent.update()` or a
change to a reactive config kicks off the "triangular worker communication":

1.  **App Worker → VDOM Worker:** The App Worker sends a snapshot of the component's `vdom` and previous `vnode` to the VDOM Worker.
2.  **VDOM Worker → Main Thread:** The VDOM Worker creates the new `vnode` tree. calculates the minimal set of changes
    (the `deltas`). It sends both to the Main Thread.
3.  **Main Thread → App Worker:** The Main Thread applies the `deltas` to the real DOM. It then sends the new `vnode`
     back to the App Worker, which assigns it to the component (`myComponent.vnode = newVnode`) and resolves any promises
     associated with the update cycle.

#### The Immutable Snapshot: The Key to the Paradox

The genius of this model lies in how the App Worker communicates with the VDOM Worker. It doesn't send a live, mutable
object. Instead, it creates a deep, JSON-serializable **snapshot** of the component's `vdom` tree.

This snapshot is, by its very nature, an **immutable copy**.

This single architectural choice unlocks the entire paradigm:

*   **Developer Freedom:** As a developer in the App Worker, you are free to mutate your component's state and VDOM at
    any time. You can change a property, push a new child into the `vdom.cn` array, and then immediately change another property.
*   **Pipeline Safety:** The VDOM worker receives a clean, predictable, "frozen-in-time" version of the UI to work with.
    It is completely isolated from any mutations that might be happening back in the App Worker while it's calculating the diff.

This completely eliminates the need for developers to manage immutability. You get a developer experience that is
fundamentally simpler and more aligned with how JavaScript objects naturally work, while the framework ensures the update
process is as safe and predictable as in the most rigidly immutable systems.

### Tying It All Together

When you define a component, the framework connects these pieces for you:

1.  Every reactive config (both **Named** like `greeting_` and **Anonymous** via `useConfig`) is backed by its own
    `Neo.core.Config` instance.
2.  Your entire `createVdom` function is wrapped in a single, master `Neo.core.Effect`.
3.  When `createVdom` runs, it reads from various `Config` instances, and the `EffectManager` ensures they are all
    registered as dependencies of the master `Effect`.
4.  When any of those configs change, the master `Effect` re-runs, your `createVdom` is executed again, and the UI updates.

This elegant, layered architecture is what provides the power and performance of the v10 reactivity system, delivering a
developer experience that is both simple on the surface and incredibly robust underneath.

---

## Architectural Proof: The Asynchronous Lifecycle

The Two-Tier Reactivity system isn't just for managing the state inside a single component. Its true power is revealed
when it's used to solve complex, application-wide architectural challenges. The most potent example of this is how
Neo.mjs v10 handles the "lazy-load paradox."

This is enabled by three fundamental v10 features: enhanced mixins, an async-aware lifecycle, and intelligent remote
method interception.

### 1. Enhanced Mixins: True Modules of State and Behavior

This is a core tenet of the Neo.mjs philosophy: **architectural depth enables surface-level simplicity.**

For v10, we revolutionized how our class system handles **mixins**. Previously, they could only copy methods. Now, they
can also carry their own `configs`, elevating them into truly self-contained modules of both state and behavior. This
allows us to encapsulate complex logic (e.g., for rendering or remote communication) into single, reusable modules that
can be cleanly applied to any class.

### 2. A Two-Phase, Async-Aware Lifecycle (`initAsync`)

Every class in Neo.mjs now has a two-phase initialization process. The `construct()` method runs instantly and
synchronously. It is then followed by `initAsync()`, an `async` method designed for long-running tasks.
The framework provides a reactive `isReady_` config that automatically flips to `true` only after the `initAsync()`
promise resolves.

### 3. Intelligent Remote Method Interception

The framework's `RemoteMethodAccess` mixin is aware of this `isReady` state. When a remote call arrives for a main
thread addon that is not yet ready, it doesn't fail. Instead, it **intercepts the call**.

Let's walk through a practical example: using a powerful, but large, third-party charting library like AmCharts on the
main thread.

*   Loading it upfront is bad for performance; it blocks the initial application load.
*   Lazy-loading it creates a classic race condition: what happens if your App Worker sends a command to create a chart
    *before* the AmCharts library has finished downloading and initializing?

In a traditional framework, this would require complex, manual state management. In Neo.mjs, the solution is an
elegant and automatic feature of the core reactivity system.

1.  An `AmChart` wrapper component in the App Worker is mounted and sends a remote command: `Neo.main.addon.AmCharts.create(...)`.
2.  On the main thread, the `AmCharts` addon receives the call. It checks its own `isReady` state, which is `false`.
3.  Instead of executing the `create` method, it **caches the request** in an internal queue.
4.  Crucially, it **immediately triggers its own `initAsync()` process**, which begins downloading the AmCharts library files.
5.  Once the files are loaded, `initAsync()` resolves, and the addon's `isReady` flag flips to `true`.
6.  The `afterSetIsReady()` hook—a standard feature of the reactivity system—automatically fires, processes the queue of
    cached calls, and finally creates the chart.

The developer in the App Worker is completely shielded from this complexity. They simply call a method, and the framework
guarantees it will be executed correctly and in the right order. There are no manual loading flags, no race conditions,
and no complex queueing logic to write.

This is the ultimate expression of the Neo.mjs philosophy: using the core reactivity engine not just to render UIs, but
to orchestrate the entire application's asynchronous state and logic. It's the final proof that a robust reactive foundation
doesn't just simplify your code — it makes entirely new patterns of development possible.
