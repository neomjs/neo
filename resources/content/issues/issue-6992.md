---
id: 6992
title: Functional Components
state: OPEN
labels:
  - enhancement
  - epic
  - no auto close
assignees: []
createdAt: '2025-07-09T10:50:47Z'
updatedAt: '2025-10-14T07:37:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6992'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 6993 Create `Neo.component.mixin.VdomLifecycle`'
  - '[x] 6994 Create `Neo.functional.component.Base`'
  - '[x] 6995 Create Interoperability Layer'
  - '[x] 6996 Encourage Pure VDOM Effects'
  - '[ ] 6997 Implement Effect Memoization'
  - '[x] 7010 Proof of Concept: Beginner Mode Functional Component'
  - '[x] 7011 DOM Event Handling for Beginner Mode Functional Components'
  - '[x] 7012 Create `Neo.functional.useConfig` Hook'
  - '[x] 7013 Create `Neo.functional.defineComponent` Factory'
  - '[x] 7014 Enhance `Neo.functional.component.Base` for Hook Support'
  - '[x] 7015 Enhance `Neo.core.Effect` Constructor'
  - '[x] 7016 functional.component.Base: enhance the module export'
  - '[x] 7017 mixin.component.VdomLifecycle => mixin.VdomLifecycle'
  - '[x] 7019 Refactor `defineComponent` and Enhance Config System Documentation'
  - '[x] 7021 mixin.VdomLifecycle: createVdomReference()'
  - '[x] 7022 examples.functional.defineComponent'
  - '[x] 7027 Feature: Robust Synchronous Updates for Functional Components'
  - '[x] 7025 Fix: EffectBatchManager.endBatch() Infinite Loop Prevention'
  - '[x] 7024 Refactor `Neo.core.Effect` to Use a Reactive `isRunning` State'
  - '[x] 7023 Enhance `Neo.core.Config` for Robust Subscriptions with Scope'
  - '[x] 7026 Feature: Fine-grained Reactivity Control with EffectManager.pause()'
  - '[x] 7028 Feature: Centralized Functional Component Exports via _export.mjs'
  - '[x] 7042 Regression: Neo.core.Effect.run() executes twice'
  - '[x] 7043 Refactor: Extract DOM Event Handling to `DomEvents` Mixin'
  - '[x] 7046 Reactive Updates for Nested Components in Functional VDOM'
  - '[ ] 7047 Task: Create Example for Deeply Nested Components'
  - '[x] 7050 Task: Enhance functional.component.Base with Core Configs'
  - '[x] 7053 Architectural Enhancement: Implement VDOM Config Diffing in FunctionalBase'
  - '[x] 7054 Architectural Enhancement: Recursive VDOM Config Diffing for Nested Components'
  - '[x] 7055 examples.ConfigurationViewport: make createConfigurationComponents() optionally async'
  - '[x] 7057 Enable support for nesting functional components'
  - '[x] 7062 functional.component.Base: enhance the `destroy()` signature'
  - '[x] 7069 Enhance LivePreview for Modern JavaScript and Functional Components'
  - '[x] 7070 learn/tutorials/TodoList: create a `functional.component.Base` version'
  - '[x] 7071 layout.Flexbox: applyChildAttributes() => opt out for functional cmps'
  - '[x] 7074 Improve Functional Component Initial Render Timing'
  - '[x] 7075 Enable Granular VDOM Updates for Functional Components'
subIssuesCompleted: 35
subIssuesTotal: 37
blockedBy: []
blocking: []
---
# Functional Components

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

Example usage:
```javascript
import {defineComponent, useConfig} from '../../../src/functional/_export.mjs';
import Button                       from '../../../src/button/Base.mjs';

export default defineComponent({
    config: {
        className: 'Neo.examples.functional.hostComponent.Component'
    },
    createVdom() {
        const [count, setCount] = useConfig(0);

        return {cn: [
            {
                tag : 'p',
                text: `Button clicked ${count} times`
            }, {
                module : Button,
                id     : 'myButtonModule',
                theme  : 'neo-theme-neo-light',
                text   : 'Click Me (Neo Button)',
                handler: () => setCount(prev => prev + 1)
            }
        ]}
    }
});
```

## Timeline

- 2025-07-09T10:50:49Z @tobiu added the `enhancement` label
- 2025-07-09T10:50:49Z @tobiu added the `epic` label
- 2025-07-09T10:52:01Z @tobiu added sub-issue #6993
- 2025-07-09T10:53:44Z @tobiu added sub-issue #6994
- 2025-07-09T10:54:55Z @tobiu added sub-issue #6995
- 2025-07-09T10:57:05Z @tobiu added sub-issue #6996
- 2025-07-09T10:57:38Z @tobiu added sub-issue #6997
- 2025-07-11T01:57:24Z @tobiu added sub-issue #7010
- 2025-07-11T01:59:24Z @tobiu added sub-issue #7011
- 2025-07-11T02:05:41Z @tobiu added sub-issue #7012
- 2025-07-11T02:07:36Z @tobiu added sub-issue #7013
- 2025-07-11T10:23:25Z @tobiu added sub-issue #7014
- 2025-07-11T10:27:57Z @tobiu added sub-issue #7015
- 2025-07-11T10:55:52Z @tobiu added sub-issue #7016
- 2025-07-11T11:19:45Z @tobiu added sub-issue #7017
- 2025-07-11T16:32:08Z @tobiu added sub-issue #7019
- 2025-07-12T12:04:19Z @tobiu added sub-issue #7021
- 2025-07-12T12:30:52Z @tobiu added sub-issue #7022
- 2025-07-12T18:23:40Z @tobiu added sub-issue #7027
- 2025-07-12T18:27:59Z @tobiu added sub-issue #7025
- 2025-07-12T18:28:28Z @tobiu added sub-issue #7024
- 2025-07-12T18:29:12Z @tobiu added sub-issue #7023
- 2025-07-12T18:29:43Z @tobiu added sub-issue #7026
- 2025-07-12T18:46:00Z @tobiu added sub-issue #7028
- 2025-07-13T11:57:02Z @tobiu added sub-issue #7042
- 2025-07-13T17:13:32Z @tobiu added sub-issue #7043
- 2025-07-14T13:48:21Z @tobiu added sub-issue #7046
- 2025-07-14T14:03:08Z @tobiu added sub-issue #7047
- 2025-07-14T14:54:28Z @tobiu added sub-issue #7050
- 2025-07-14T16:36:37Z @tobiu added sub-issue #7053
- 2025-07-14T17:26:49Z @tobiu added sub-issue #7054
- 2025-07-15T08:29:13Z @tobiu added sub-issue #7055
- 2025-07-15T13:17:17Z @tobiu added sub-issue #7057
- 2025-07-15T17:42:06Z @tobiu added sub-issue #7062
- 2025-07-15T23:45:14Z @tobiu added sub-issue #7069
- 2025-07-16T01:02:27Z @tobiu added sub-issue #7070
- 2025-07-16T02:34:49Z @tobiu added sub-issue #7071
- 2025-07-16T11:29:13Z @tobiu added sub-issue #7074
- 2025-07-16T12:50:16Z @tobiu added sub-issue #7075
### @github-actions - 2025-10-14T02:41:14Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-10-14T02:41:14Z @github-actions added the `stale` label
- 2025-10-14T07:37:55Z @tobiu removed the `stale` label
- 2025-10-14T07:37:55Z @tobiu added the `no auto close` label

