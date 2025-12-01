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
  - 6993
  - 6994
  - 6995
  - 6996
  - 6997
  - 7010
  - 7011
  - 7012
  - 7013
  - 7014
  - 7015
  - 7016
  - 7017
  - 7019
  - 7021
  - 7022
  - 7027
  - 7025
  - 7024
  - 7023
  - 7026
  - 7028
  - 7042
  - 7043
  - 7046
  - 7047
  - 7050
  - 7053
  - 7054
  - 7055
  - 7057
  - 7062
  - 7069
  - 7070
  - 7071
  - 7074
  - 7075
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

## Comments

### @github-actions - 2025-10-14 02:41

This issue is stale because it has been open for 90 days with no activity.

## Activity Log

- 2025-07-09 @tobiu added the `enhancement` label
- 2025-07-09 @tobiu added the `epic` label
- 2025-07-09 @tobiu added sub-issue #6993
- 2025-07-09 @tobiu added sub-issue #6994
- 2025-07-09 @tobiu added sub-issue #6995
- 2025-07-09 @tobiu added sub-issue #6996
- 2025-07-09 @tobiu added sub-issue #6997
- 2025-07-11 @tobiu added sub-issue #7010
- 2025-07-11 @tobiu added sub-issue #7011
- 2025-07-11 @tobiu added sub-issue #7012
- 2025-07-11 @tobiu added sub-issue #7013
- 2025-07-11 @tobiu added sub-issue #7014
- 2025-07-11 @tobiu added sub-issue #7015
- 2025-07-11 @tobiu added sub-issue #7016
- 2025-07-11 @tobiu added sub-issue #7017
- 2025-07-11 @tobiu added sub-issue #7019
- 2025-07-12 @tobiu added sub-issue #7021
- 2025-07-12 @tobiu added sub-issue #7022
- 2025-07-12 @tobiu added sub-issue #7027
- 2025-07-12 @tobiu added sub-issue #7025
- 2025-07-12 @tobiu added sub-issue #7024
- 2025-07-12 @tobiu added sub-issue #7023
- 2025-07-12 @tobiu added sub-issue #7026
- 2025-07-12 @tobiu added sub-issue #7028
- 2025-07-13 @tobiu added sub-issue #7042
- 2025-07-13 @tobiu added sub-issue #7043
- 2025-07-14 @tobiu added sub-issue #7046
- 2025-07-14 @tobiu added sub-issue #7047
- 2025-07-14 @tobiu added sub-issue #7050
- 2025-07-14 @tobiu added sub-issue #7053
- 2025-07-14 @tobiu added sub-issue #7054
- 2025-07-15 @tobiu added sub-issue #7055
- 2025-07-15 @tobiu added sub-issue #7057
- 2025-07-15 @tobiu added sub-issue #7062
- 2025-07-15 @tobiu added sub-issue #7069
- 2025-07-16 @tobiu added sub-issue #7070
- 2025-07-16 @tobiu added sub-issue #7071
- 2025-07-16 @tobiu added sub-issue #7074
- 2025-07-16 @tobiu added sub-issue #7075
- 2025-10-14 @github-actions added the `stale` label
- 2025-10-14 @tobiu removed the `stale` label
- 2025-10-14 @tobiu added the `no auto close` label

