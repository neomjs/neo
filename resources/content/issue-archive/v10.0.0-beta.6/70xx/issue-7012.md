---
id: 7012
title: Create `Neo.functional.useConfig` Hook
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-11T02:05:39Z'
updatedAt: '2025-07-11T10:39:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7012'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-11T10:39:44Z'
---
# Create `Neo.functional.useConfig` Hook

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

## Timeline

- 2025-07-11T02:05:41Z @tobiu added parent issue #6992
- 2025-07-11T02:05:41Z @tobiu added the `enhancement` label
- 2025-07-11T10:39:16Z @tobiu referenced in commit `fc15419` - "Create Neo.functional.useConfig Hook #7012"
- 2025-07-11T10:39:44Z @tobiu closed this issue

