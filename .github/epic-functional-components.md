# Epic: Functional Components

## Motivation

This initiative will establish a new, lightweight base class for components. This class will bypass the traditional `items` array and `layout` system. Instead, it will be driven by a central `Effect` that calls a VDOM-generating method (e.g., `createVdom()`) to declaratively build the component's UI based on its current state. This aligns with the reactive patterns of other popular frameworks and provides a more intuitive and familiar entry point for those developers.

This epic will be broken down into several sub-tickets to implement this new component architecture in an iterative and isolated manner.

Functional Components are an addition to, and not a replacement for declarative component trees based on `container.Base`: `items`.

---

## Two Modes of Functional Component Definition

Neo.mjs will offer two distinct ways to define functional components, catering to different developer preferences and needs. Both modes leverage the underlying `Neo.functional.component.Base` class and the `Neo.core.Effect` system for reactive rendering, but they provide different levels of abstraction and access to the framework's full power.

### 1. Beginner Mode: Pure Function with Hooks (e.g., `Neo.functional.defineComponent`)

This mode is designed for developers seeking a highly concise and familiar syntax, especially those coming from frameworks like React. Components are defined as plain JavaScript functions that return VDOM. State management is handled via dedicated hooks (e.g., `useConfig`).

**Characteristics:**
-   **Concise Syntax:** Focus on the VDOM rendering logic.
-   **Hook-based State:** State and side effects are managed through `use` hooks.
-   **Simplified API:** Abstracts away class boilerplate.
-   **Tier 1 Reactivity:** Primarily leverages `Neo.core.Config` for reactive values and `Neo.core.Effect` for re-rendering.
-   **No Lifecycle Hooks:** Does not expose `beforeGet`, `beforeSet`, or `afterSet` lifecycle hooks directly on the component definition, as these are tied to the class-based `static config` system.

### 2. Medium Mode: Class-based Functional Component (Extending `Neo.functional.component.Base`)

This mode provides direct access to the underlying `Neo.functional.component.Base` class, allowing developers to define components using `static config` properties. This offers a more explicit and powerful way to define reactive components within the Neo.mjs class system.

**Characteristics:**
-   **Explicit Configs:** State is defined via `static config` properties.
-   **Full Two-Tier Reactivity:** Access to both `Neo.core.Config` (Tier 1) and the `autoGenerateGetSet` mechanism (Tier 2), including `afterSet` lifecycle hooks for imperative side effects.
-   **Class-based Structure:** Familiar to developers comfortable with class-based component patterns.

---

## Sub-Ticket: Create `Neo.component.mixin.VdomLifecycle`

**Status:** Done

### 1. Summary

Create a new mixin named `Neo.component.mixin.VdomLifecycle`. This mixin will encapsulate the core VDOM rendering engine logic currently located in `Neo.component.Base`. This is the foundational step for enabling the new functional component base class and for cleaning up the existing component architecture.

### 2. Rationale

The new reactivity layer introduced in v10, centered around `Neo.core.Config` and `Neo.core.Effect`, allows for a highly efficient and declarative component model. The `src/button/Effect.mjs` class serves as a proof-of-concept for this pattern, where a single `Effect` replaces dozens of imperative `afterSet` hooks.

This new, simpler component architecture relies on the ability to compose features using Mixins. With the recent enhancement enabling mixins to merge their `static config` into a consuming class, we can now create self-contained "feature mixins" (e.g., for VDOM management).

Extracting the VDOM logic from `component.Base` into `Neo.component.mixin.VdomLifecycle` is the foundational step. It will:
- Improve code modularity and separation of concerns.
- Slim down `component.Base`, making it easier to understand and maintain.
- Provide a reusable piece of core machinery that can be used by the new `FunctionalComponentBase` without inheriting all of `component.Base`.

### 3. Scope & Implementation Plan

1.  **Create File:** Create a new file at `src/mixin/VdomLifecycle.mjs`.
2.  **Identify & Move Logic:** Move the properties and methods related to the VDOM rendering engine from `src/component/Base.mjs` into `Neo.component.mixin.VdomLifecycle`. The list of candidates we previously identified will be used as the basis for this refactoring.
3.  **Refactor `component.Base`:** Modify `src/component/Base.mjs` to use the new `VdomLifecycle` mixin, ensuring all existing functionality remains intact.

### 4. Definition of Done

-   `Neo.component.mixin.VdomLifecycle` is created and contains the extracted VDOM logic.
-   `Neo.component.Base` uses the new mixin.
-   All existing component-related tests pass without regression, confirming the refactoring is successful.

---

## Sub-Ticket: Create `Neo.functional.component.Base`

**Status:** Done

### 1. Summary

Create a new base class, `Neo.functional.component.Base`, which will serve as the foundational class for all functional components. This class provides the core reactive rendering mechanism and acts as the underlying base for both class-based functional components and the simpler, function-based "beginner mode" components.

### 2. Rationale

The primary goal of the Functional Components epic is to provide a simpler entry point into the Neo.mjs ecosystem while also offering the full power of its reactivity. This base class achieves this by providing a minimal, modern API for creating components, directly appealing to developers familiar with frameworks like React and Vue, and serving as the common foundation for different component definition styles.

### 3. Scope & Implementation Plan

1.  **Create File:** Create a new file at `src/functional/component/Base.mjs`.
2.  **Class Definition:**
    *   The class will extend `Neo.core.Base`.
    *   It will use the `Neo.component.mixin.VdomLifecycle` (created in the prerequisite ticket).
    *   It will **not** extend `Neo.component.Base` or `Neo.container.Base`.
3.  **Core API:**
    *   It will introduce a new method for developers to implement: `createVdom()`. This method is responsible for returning the component's VDOM structure based on its current configs (state).
    *   In its `construct()` method, it will create a `Neo.core.Effect`. This effect will wrap a call to `this.createVdom()` and assign the result to `this.vdom`. This ensures that any time a config used within `createVdom()` is changed, the component automatically re-renders.

### 4. Example Usage (Class-based Functional Component)

```javascript
import FunctionalBase from 'neo/functional/component/Base.mjs';

class MyFunctionalButton extends FunctionalBase {
    static config = {
        className: 'MyApp.MyFunctionalButton',
        text_    : 'Click Me'
    }

    createVdom() {
        return {
            tag : 'button',
            text: this.text
        };
    }
}

// An instance of this component would render a button and
// automatically update its text whenever `myButton.text = 'new text'` is called.
```

### 5. Definition of Done

-   `src/functional/component/Base.mjs` is created.
-   The class works as described, using `VdomLifecycle` and a central `Effect`.
-   A basic test case is created to verify that a simple `FunctionalBase` component can be rendered and updates when its configs change.

---

## Sub-Ticket: Create `Neo.functional.useConfig` Hook

**Status:** In Progress

### 1. Summary

Implement a `useConfig` hook for functional components, allowing developers to manage reactive state within their "render" functions in a React-like fashion.

### 2. Rationale

This hook provides a simplified entry point for developers familiar with `useState` from other frameworks. It leverages Neo.mjs's Tier 1 reactivity (`Neo.core.Config`) for state management without requiring class-based config definitions, making it ideal for the "beginner mode" functional component experience.

### 3. Scope & Implementation Plan

1.  **Create File:** Create `src/functional/useConfig.mjs`.
2.  **Implement `useConfig`:** The hook will return a `[value, setter]` tuple. The `setter` will update an internal `Neo.core.Config` instance.
3.  **Lifecycle Management:** Ensure the `Neo.core.Config` instance is properly managed (created, updated, destroyed) in relation to the functional component's lifecycle. This will likely involve associating the `core.Config` instance with the `Neo.functional.component.Base` instance that is executing the "render" function.

### 4. Example Usage

```javascript
import { useConfig } from 'neo/functional/useConfig.mjs';
import { defineComponent } from 'neo/functional/defineComponent.mjs'; // Assuming this exists

const MyCounter = defineComponent({
    className: 'MyApp.MyCounter',
    createVdom: () => {
        const [count, setCount] = useConfig(0);

        return {
            tag: 'button',
            text: `Count: ${count}`,
            listeners: {
                click: () => setCount(count + 1)
            }
        };
    }
});
```

### 5. Definition of Done

-   `Neo.functional.useConfig` hook is implemented and tested.
-   It correctly creates and manages reactive state via `Neo.core.Config`.
-   Changes to the state trigger re-execution of the component's render function (via `Effect`).

---

## Sub-Ticket: Create `Neo.functional.defineComponent` Factory

**Status:** Done

### 1. Summary

Implement a factory function that allows developers to define functional components using a plain JavaScript function, abstracting away the underlying class creation.

### 2. Rationale

This factory further simplifies the developer experience for "beginner mode" functional components, making the syntax more concise and familiar to developers accustomed to functional component patterns in other frameworks. It acts as the bridge between a pure function definition and the underlying `Neo.functional.component.Base` class.

### 3. Scope & Implementation Plan

1.  **Create File:** Create `src/functional/defineComponent.mjs`.
2.  **Implement `defineComponent`:** The factory will accept a configuration object (including `className`, optional `ntype`, and the `createVdom` function).
3.  **Internal Class Generation:** Internally, `defineComponent` will create a new class that extends `Neo.functional.component.Base`. It will apply the provided `className` and `ntype` to this new class.
4.  **`createVdom` Method Assignment:** The developer's `createVdom` function will be assigned as the `createVdom` method of the generated class's prototype.
5.  **Integration with `useConfig`:** Ensure that the context (`this`) within the developer's `createVdom` function (when executed by the generated component instance) allows `useConfig` to correctly associate state with that instance.

### 4. Example Usage

```javascript
import { defineComponent } from 'neo/functional/defineComponent.mjs';
import { useConfig }       from 'neo/functional/useConfig.mjs';

const MyGreeting = defineComponent({
    className: 'MyApp.MyGreeting',
    createVdom: (config) => {
        const [name, setName] = useConfig('World');

        return {
            tag: 'div',
            text: `Hello, ${name}!`,
            listeners: {
                click: () => setName(name === 'World' ? 'Neo.mjs' : 'World')
            }
        };
    }
});
```

### 5. Definition of Done

-   `Neo.functional.defineComponent` factory is implemented and tested.
-   It successfully generates functional component classes from plain functions.
-   Generated components correctly utilize `useConfig` for state management.

---

# Sub-Ticket: Enhance `Neo.functional.component.Base` for Hook Support

**Status:** Done

## 1. Summary

This ticket covers the foundational work on `Neo.functional.component.Base` to enable the hook system (`useConfig`, `useEvent`, etc.) for beginner-mode functional components. The key challenge was to allow external hook functions to manage state on a component instance without exposing that state through the public API.

## 2. Rationale

The initial implementation of `functional.component.Base` was a minimal class with a `createVdom` method driven by an `Effect`. To support hooks like React's `useState`, we needed a mechanism to:
1.  Associate state (like `Config` instances) with a specific component instance.
2.  Track the order of hook calls within a single `createVdom` execution.
3.  Provide a way for external hook functions to access this internal state securely.

Using protected properties (e.g., `_hooks`) was considered but deemed insufficient for true encapsulation. The chosen solution provides a robust, framework-private way to manage hook state.

## 3. Scope & Implementation Plan

1.  **Introduce Symbols for State:**
    *   Create two `Symbol.for()` symbols: `hookIndexSymbol` and `hooksSymbol`.
    *   These symbols act as unique keys for properties on the component instance, making them accessible to any module that knows the symbol, but keeping them off the public API.

2.  **Initialize State in `FunctionalBase`:**
    *   In the `construct()` method of `functional.component.Base`, use `Object.defineProperties` to add the symbol-keyed properties (`[hookIndexSymbol]` and `[hooksSymbol]`) to the component instance.
    *   These properties are configured to be non-enumerable (`enumerable: false`) to further hide them from standard object iteration.
    *   The `hookIndex` is reset to `0` at the beginning of every `vdomEffect` execution, ensuring a clean slate for each render.

3.  **Component Registration:**
    *   Implement the `afterSetId()` and `destroy()` methods to correctly register and unregister the functional component instance with `Neo.manager.Component`. This makes functional components discoverable via `Neo.getComponent()`, integrating them fully into the framework's component model.

4.  **Link Effect to Component:**
    *   Modify the `vdomEffect` creation to pass the component's ID (`this.id`) to the `Effect` constructor. This allows the `useConfig` hook to retrieve the currently rendering component instance by getting the active effect from `EffectManager` and looking up the component by its ID.

## 4. Definition of Done

-   `functional.component.Base` is updated to use `Symbol.for()` to manage internal hook state.
-   The component correctly registers and unregisters itself with `ComponentManager`.
-   The `vdomEffect` is correctly associated with the component's ID.
-   The implementation provides the necessary foundation for the `useConfig` hook to function correctly.

# Sub-Ticket: Enhance `Neo.core.Effect` Constructor

**Status:** Done

## 1. Summary

This ticket covers a minor but important enhancement to the `Neo.core.Effect` class to support the functional component hook system.

## 2. Rationale

To allow hooks like `useConfig` to identify which component is currently rendering, we needed a way to link an active `Effect` back to its owner component. The cleanest, most decoupled way to achieve this was to add an optional `componentId` to the `Effect`'s constructor.

Since `core.Effect` is a new class introduced in the v10 beta series, adding an optional parameter is a safe, non-breaking change.

## 3. Scope & Implementation Plan

1.  **Update `Effect` Constructor:**
    *   Modify the `constructor` of `Neo.core.Effect` to accept an optional second parameter, `componentId`.
    *   If `componentId` is provided, store it on a public `this.componentId` property on the effect instance.

2.  **Update `FunctionalBase`:**
    *   In `Neo.functional.component.Base`, update the creation of the `vdomEffect` to pass `this.id` as the second argument to the `Effect` constructor.

## 4. Definition of Done

-   The `Neo.core.Effect` constructor is updated to accept an optional `componentId`.
-   `functional.component.Base` correctly passes its ID when creating its `vdomEffect`.
-   This change enables the `useConfig` hook to reliably get the current component instance.

## Sub-Ticket: Create Interoperability Layer

**Status:** To Do

### 1. Summary

Design and implement the mechanism that allows functional components to seamlessly host classic components (e.g., `Neo.grid.Container`) and vice-versa. This is critical for ensuring that developers can adopt the new functional paradigm without losing access to the existing library of powerful, classic components.

### 2. Rationale

A developer will inevitably need to mix and match component paradigms. For example, they might build the main structure of their application using new functional components but need to include a complex, data-driven component like the grid. Without a robust interoperability layer, this would be impossible, creating a fractured ecosystem.

The core challenge is that functional components define children declaratively as part of a VDOM tree, while classic components are instantiated via `Neo.create()` and managed within an `items` array. We need to bridge this gap.

### 3. Technical Challenges & Example

Consider a `FunctionalBase` component trying to render a classic grid:

```javascript
// Inside a FunctionalBase component...
createVdom() {
    return {
        tag: 'div',
        cn: [
            {tag: 'h1', text: 'My Classic Grid'},
            {
                // This is just a VDOM node, not an instance yet
                module: Neo.grid.Container,
                store: this.myStore,
                columns: [...]
            }
        ]
    };
}
```

To make this work, the system (likely the `VdomLifecycle` mixin) must solve these problems when it processes the VDOM from `createVdom()`:

1.  **Instantiation:** It must detect VDOM nodes that represent component definitions (e.g., via a `module` or `ntype` key) and automatically call `Neo.create()` to turn them into component instances. The logic inside `container.Base#createItem` is a good reference for this.
2.  **Parent/Child Linking:** Once the classic component instance (the grid) is created, its `parentId` must be set to the `id` of the functional component that is rendering it. The `parent` property should also be correctly linked.
3.  **Context Propagation:** This parent/child link is essential for context-aware features. The grid instance must be able to find its parent's controller or state provider via `getController()` and `getStateProvider()`.

### 4. Scope & Implementation Plan

-   Enhance the `VdomLifecycle` mixin (or create a new helper) to traverse VDOM trees before they are sent to the renderer.
-   This traversal logic will identify and instantiate component definitions.
-   It will be responsible for setting `parentId` on the new child instances.
-   Create test cases that verify a functional component can successfully render a classic `container.Base` and that the classic container can find its functional parent's controller.

### 5. Definition of Done

-   A functional component can successfully render a classic component defined within its `createVdom` method.
-   The classic component is correctly mounted in the DOM.
-   The classic component can access its functional parent via `this.parent`.
-   Context-aware features work across the boundary.

---

## Sub-Ticket: Encourage Pure VDOM Effects

**Status:** To Do

### 1. Summary

Define and promote best practices for writing "pure" VDOM-generating methods (e.g., `createVdom()`) within functional components. This ensures that the output of these methods is solely determined by their inputs (component configs) and that they produce no side effects, which is crucial for predictability and enabling future optimizations like memoization.

### 2. Rationale

The `Neo.core.Effect` system automatically re-executes VDOM-generating methods when their dependencies changes. For this system to be truly robust and performant, these methods should ideally be pure functions. Purity makes components easier to reason about, test, and debug. It also unlocks significant performance gains through memoization, as the output can be safely cached if inputs remain unchanged.

### 3. Scope & Implementation Plan

1.  **Define Purity Guidelines:** Clearly document what constitutes a "pure" VDOM-generating method in the context of Neo.mjs functional components. This includes avoiding direct DOM manipulation, external state modification, or reliance on non-reactive global state within `createVdom()`.
2.  **Documentation:** Add a section to the functional component documentation explaining the concept of pure effects and why it's important.
3.  **Linting/Static Analysis (Optional, Future):** Explore the possibility of adding linting rules or static analysis checks to identify potential impurities in `createVdom()` methods.

### 4. Definition of Done

-   Clear guidelines for writing pure VDOM-generating methods are documented.
-   The documentation explains the benefits of purity and provides examples.

---

## Sub-Ticket: Implement Effect Memoization

**Status:** To Do

### 1. Summary

Enhance the `Neo.core.Effect` system (or provide a utility around it) to support memoization for VDOM-generating methods. This will significantly improve rendering performance by caching the VDOM output and preventing unnecessary re-executions when component configs (inputs) have not changed.

### 2. Rationale

Functional components, driven by `Neo.core.Effect`, re-generate their VDOM whenever a tracked config changes. While efficient, re-generating complex VDOM trees can still be computationally intensive. By memoizing the output of pure VDOM-generating methods, we can avoid redundant work. If the inputs to `createVdom()` are the same as the last execution, the cached VDOM can be returned directly, bypassing the VDOM generation and worker communication steps.

### 3. Scope & Implementation Plan

1.  **Memoization Mechanism:** Design and implement a caching layer for `Neo.core.Effect` instances (or a new `MemoizedEffect` class). This mechanism will:
    *   Store the last computed VDOM output.
    *   Efficiently compare current inputs (tracked configs) with previous inputs to determine if re-execution is necessary.
    *   Invalidate the cache when inputs change.
2.  **Integration:** Determine how developers will opt-in to memoization (e.g., a config on `FunctionalBase`, a decorator, or a utility function).
3.  **Performance Testing:** Create benchmarks to measure the performance gains achieved through memoization, especially for components with complex VDOM structures or frequently updated but unchanged inputs.

### 4. Definition of Done

-   A memoization mechanism for `Neo.core.Effect` is implemented.
-   Functional components can leverage memoization to improve rendering performance.
-   Performance benchmarks demonstrate measurable gains.

## Sub-Ticket: Proof of Concept: Beginner Mode Functional Component

**Status:** To Do

### 1. Summary

Create a simple, working example of a "Beginner Mode" functional component using `Neo.functional.defineComponent` and `Neo.functional.useConfig`.

### 2. Rationale

This PoC is crucial to validate the end-to-end developer experience for the simplified functional component definition. It will demonstrate that a developer can define a reactive component as a plain function, leveraging hooks for state, and that it renders correctly and updates reactively.

### 3. Scope & Implementation Plan

1.  **Create a Simple Component:** Define a basic functional component (e.g., a counter or a text display) using the `defineComponent` factory and `useConfig` hook.
2.  **Render the Component:** Instantiate and render this component within a test environment or a minimal application.
3.  **Verify Reactivity:** Ensure that changes to the state managed by `useConfig` correctly trigger re-renders of the component.

### 4. Example Usage

```javascript
// In a component file (e.g., MyCounter.mjs)
import { defineComponent } from 'neo/functional/defineComponent.mjs';
import { useConfig }       from 'neo/functional/useConfig.mjs';

export default defineComponent(function MyCounter(config) { // The functional component is now the function itself
    const [count, setCount] = useConfig(0);

    return {
        tag: 'button',
        text: `Count: ${count}`,
        // No listeners property directly in VDOM for beginner mode
    };
});

// In your app's MainView or a test file
// Neo.create(MyCounter, { id: 'my-counter-instance' });
```

### 5. Definition of Done

-   A functional component defined as a plain function using `defineComponent` and `useConfig` is successfully rendered.
-   The component's state updates reactively, and these updates are reflected in the DOM.

---

## Sub-Ticket: DOM Event Handling for Beginner Mode Functional Components

**Status:** To Do

### 1. Summary

Explore and define the idiomatic way for developers to handle DOM events within "Beginner Mode" functional components, ensuring integration with Neo.mjs's powerful, separate DOM event engine.

### 2. Rationale

Unlike some other frameworks, Neo.mjs has a dedicated and highly optimized DOM event management system that operates separately from the VDOM. Directly embedding `listeners` within the VDOM (as is common in React) is not the Neo.mjs way and can lead to confusion and suboptimal performance. This ticket aims to define a clear, intuitive, and performant pattern for event handling in the simplified functional component mode.

### 3. Scope & Implementation Plan

1.  **Research Existing Patterns:** Analyze how Neo.mjs's DOM event engine (`Neo.manager.DomEvent`) is currently used and how it can be exposed in a functional, hook-like manner.
2.  **Propose API:** Brainstorm and propose a `useEvent` hook or similar API that allows developers to attach event listeners to VDOM nodes declaratively within their `createVdom` function, without directly embedding `listeners` in the VDOM object.
3.  **Integration:** Ensure the proposed API seamlessly integrates with the underlying `Neo.functional.component.Base` instance and the `Neo.manager.DomEvent`.
4.  **Documentation:** Provide clear examples and guidelines for using the new event handling mechanism.

### 4. Example Usage (Conceptual)

```javascript
import { defineComponent } from 'neo/functional/defineComponent.mjs';
import { useConfig }       from 'neo/functional/useConfig.mjs';
import { useEvent }        from 'neo/functional/useEvent.mjs'; // New hook

export default defineComponent(function MyClickableDiv(config) {
    const [count, setCount] = useConfig(0);

    // Attach a click listener using the new hook
    useEvent('click', (event) => {
        setCount(count + 1);
        console.log('Div clicked!', event);
    });

    return {
        tag: 'div',
        html: `Clicked ${count} times`,
        // No listeners property directly in VDOM
    };
});
```

### 5. Definition of Done

-   A clear and idiomatic pattern for DOM event handling in "Beginner Mode" functional components is defined.
-   Necessary hooks/utilities (e.g., `useEvent`) are designed.
-   Documentation and examples are provided.

