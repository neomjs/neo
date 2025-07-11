# Epic: Functional Components

## Motivation

This initiative will establish a new, lightweight base class for components. This class will bypass the traditional `items` array and `layout` system. Instead, it will be driven by a central `Effect` that calls a VDOM-generating method (e.g., `createVdom()`) to declaratively build the component's UI based on its current state. This aligns with the reactive patterns of other popular frameworks and provides a more intuitive and familiar entry point for those developers.

This epic will be broken down into several sub-tickets to implement this new component architecture in an iterative and isolated manner.

Functional Components are an addition to, and not a replacement for declarative component trees based on `container.Base`: `items`.

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

**Status:** To Do

### 1. Summary

Create a new base class, `Neo.functional.component.Base`, which will serve as the foundation for the new declarative component paradigm. This class will provide a minimal, modern API for creating components, directly appealing to developers familiar with frameworks like React and Vue.

### 2. Rationale

The primary goal of the Functional Components epic is to provide a simpler entry point into the Neo.mjs ecosystem. This requires a base class that is free from the conceptual overhead of the classic component hierarchy (e.g., the `items` array and `layout` system). `FunctionalBase` will be this class, offering a pure, state-driven rendering experience.

### 3. Scope & Implementation Plan

1.  **Create File:** Create a new file at `src/component/FunctionalBase.mjs`.
2.  **Class Definition:**
    *   The class will extend `Neo.core.Base`.
    *   It will use the `Neo.component.mixin.VdomLifecycle` (created in the prerequisite ticket).
    *   It will **not** extend `Neo.component.Base` or `Neo.container.Base`.
3.  **Core API:**
    *   It will introduce a new method for developers to implement: `createVdom()`. This method is responsible for returning the component's VDOM structure based on its current configs (state).
    *   In its `construct()` method, it will create a `Neo.core.Effect`. This effect will wrap a call to `this.createVdom()` and assign the result to `this.vdom`. This ensures that any time a config used within `createVdom()` is changed, the component automatically re-renders.

### 4. Example Usage

```javascript
import FunctionalBase from 'neo/component/FunctionalBase.mjs';

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

-   `src/component/FunctionalBase.mjs` is created.
-   The class works as described, using `VdomLifecycle` and a central `Effect`.
-   A basic test case is created to verify that a simple `FunctionalBase` component can be rendered and updates when its configs change.

---

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
