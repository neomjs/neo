---
id: 7013
title: Create `Neo.functional.defineComponent` Factory
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-11T02:07:35Z'
updatedAt: '2025-07-11T09:25:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7013'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-11T09:25:11Z'
---
# Create `Neo.functional.defineComponent` Factory

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

## Timeline

- 2025-07-11T02:07:36Z @tobiu added parent issue #6992
- 2025-07-11T02:07:37Z @tobiu added the `enhancement` label
- 2025-07-11T09:24:55Z @tobiu referenced in commit `27d6ef8` - "Create Neo.functional.defineComponent Factory
#7013"
- 2025-07-11T09:25:12Z @tobiu closed this issue

