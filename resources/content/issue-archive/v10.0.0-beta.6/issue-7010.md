---
id: 7010
title: 'Proof of Concept: Beginner Mode Functional Component'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-11T01:57:23Z'
updatedAt: '2025-07-13T17:32:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7010'
author: tobiu
commentsCount: 1
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-13T17:32:42Z'
---
# Proof of Concept: Beginner Mode Functional Component

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

## Timeline

- 2025-07-11T01:57:24Z @tobiu added the `enhancement` label
- 2025-07-11T01:57:24Z @tobiu added parent issue #6992
### @tobiu - 2025-07-13T17:32:42Z

resolved via: https://github.com/neomjs/neo/tree/dev/examples/functional/defineComponent

- 2025-07-13T17:32:42Z @tobiu closed this issue

