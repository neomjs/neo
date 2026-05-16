---
id: 7011
title: DOM Event Handling for Beginner Mode Functional Components
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-11T01:59:23Z'
updatedAt: '2025-07-13T23:27:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7011'
author: tobiu
commentsCount: 1
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-13T23:27:20Z'
---
# DOM Event Handling for Beginner Mode Functional Components

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

## Timeline

- 2025-07-11T01:59:24Z @tobiu added parent issue #6992
- 2025-07-11T01:59:25Z @tobiu added the `enhancement` label
### @tobiu - 2025-07-13T20:21:37Z

## Roadmap for `useEvent` Hook in Functional Components

This document outlines the conceptual design and implementation plan for the `useEvent` hook, enabling idiomatic DOM event handling within "Beginner Mode" functional components in Neo.mjs.

### 1. Core Concept

The `useEvent` hook will allow functional components to declare their intent to listen for DOM events. The actual registration and de-registration of these listeners with `Neo.manager.DomEvent` will be managed by the component's lifecycle, ensuring `createVdom` remains a pure function focused solely on VDOM generation.

### 2. Key Components & Their Roles

#### 2.1. `useEvent` Hook (within `createVdom` of functional components)

*   **Purpose:** To collect event listener specifications (event type, handler function, optional delegate selector).
*   **Mechanism:**
    *   It will obtain a reference to the current functional component instance (via a context mechanism, e.g., `_currentComponentInstance`).
    *   It will add the event listener specification (e.g., `{ eventType: 'click', handler: myHandler, delegate: '.my-class' }`) to a non-reactive internal array or map on the component instance (e.g., `this._pendingDomEvents`). This data collection operation itself must *not* trigger any reactive updates of the `createVdom` effect.
    *   The handler function provided to `useEvent` will be a closure that captures the current state of the functional component (e.g., `count` from `useConfig`).

#### 2.2. `Neo.functional.component.Base` (The Functional Component Instance)

*   **New Internal Property:** `_pendingDomEvents` (e.g., an array) to temporarily store event listener specifications collected during a `createVdom` run.
*   **Lifecycle Integration:**
    *   **`afterSetMounted` Hook:** This is the critical point for actual event listener registration.
        *   It will iterate through `this._pendingDomEvents`.
        *   For each specification, it will call `this.addDomListeners()` (a method provided by the `DomEvents` mixin). This is where the actual interaction with `Neo.manager.DomEvent` occurs, sending instructions to the main thread to register the listeners.
        *   After processing all pending events, `this._pendingDomEvents` should be cleared to prevent re-registration on subsequent `createVdom` runs.
    *   **`destroy` Hook:**
        *   It will call `this.removeDomListeners()` (from the `DomEvents` mixin) to ensure all registered listeners are properly cleaned up when the component instance is destroyed, preventing memory leaks.

#### 2.3. `Neo.mixin.DomEvents`

*   **Role:** Continues to provide the `domListeners_` config and the `addDomListeners`/`removeDomListeners` methods. These methods serve as the interface for components to interact with `Neo.manager.DomEvent` for event registration and de-registration.

#### 2.4. `Neo.manager.DomEvent` (App Worker)

*   **Role:** Remains the central hub for delegated DOM event management within the app worker. It receives event registration/de-registration requests from components (via `addDomListeners`/`removeDomListeners`) and handles the communication with the main thread for actual DOM event observation and dispatch.

### 3. Benefits of this Approach

*   **Purity of `createVdom`:** The `createVdom` function remains a pure function, focused solely on generating the VDOM structure. Side effects like DOM event registration are deferred to appropriate lifecycle hooks.
*   **Correct Lifecycle Management:** Event listeners are correctly added only when the component's DOM is mounted and removed when the component is destroyed, preventing memory leaks and ensuring robust behavior.
*   **Leveraging Existing Infrastructure:** Fully utilizes the powerful, optimized, and already established `Neo.manager.DomEvent` and `DomEvents` mixin.
*   **Idiomatic Functional Component API:** Provides a clean, declarative, and intuitive `useEvent` hook that aligns with the functional component paradigm.
*   **Reactive System Compatibility:** Ensures that the event registration process does not interfere with or create unintended dependencies within the `core.Effect` that wraps `createVdom`.

### 4. Next Steps (Implementation)

1.  **Implement `useEvent` Hook:** Write the `useEvent` function. This hook will retrieve the current functional component instance by accessing `EffectManager.getActiveEffect().componentId` and then using `Neo.getComponent()` to get the instance. It will then collect event specifications and store them on the component instance's `_pendingDomEvents` property.
2.  **Integrate with `FunctionalBase`:** Modify `Neo.functional.component.Base` to manage the `_pendingDomEvents` property and integrate the `addDomListeners`/`removeDomListeners` calls within its lifecycle (`afterSetMounted` and `destroy`).
3.  **Testing and Documentation:** Thoroughly test the new hook and provide clear documentation and examples.

- 2025-07-13T20:22:46Z @tobiu referenced in commit `9c17d6d` - "DOM Event Handling for Beginner Mode Functional Components #7011 WIP"
- 2025-07-13T20:54:01Z @tobiu referenced in commit `23a3866` - "DOM Event Handling for Beginner Mode Functional Components #7011"
- 2025-07-13T23:27:20Z @tobiu closed this issue

