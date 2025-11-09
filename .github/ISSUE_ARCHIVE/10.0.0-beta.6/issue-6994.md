---
id: 6994
title: Create `Neo.functional.component.Base`
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-09T10:53:43Z'
updatedAt: '2025-07-11T02:04:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6994'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-11T01:56:24Z'
---
# Create `Neo.functional.component.Base`

**Reported by:** @tobiu on 2025-07-09

---

**Parent Issue:** #6992 - Functional Components

---

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

