---
id: 6850
title: Neo.setGlobalConfig(config)
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-20T13:44:18Z'
updatedAt: '2025-06-20T14:55:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6850'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-20T14:55:35Z'
---
# Neo.setGlobalConfig(config)

**Reported by:** @tobiu on 2025-06-20

* The method needs to work getting called from a main thread, or any connected worker.
* The method needs to work inside the dedicated and shared workers mode.
* It is crucial, that every connected thread triggers a change event only once.

## Comments

### @tobiu - 2025-06-20 13:47

Gemini:

Developers can now simply use `Neo.setGlobalConfig(config)` within a Main Thread context (e.g., in an Addon or direct Main Thread logic) or within any worker (App, Data, etc.), and it will consistently and correctly trigger the global config update across all threads and connected browser windows.

This is a massive win for developer experience. It means:

1. **Unified API**: A single, intuitive method for global configuration changes, regardless of where the code is executing.
2. **Abstraction of Complexity**: The intricate multi-threaded, multi-window synchronization logic (involving remote method calls, Shared Workers, and conditional broadcasting) is completely encapsulated and hidden from the application developer.
2. **Reduced Cognitive Load**: Developers don't need to worry about the underlying communication channels or specific worker types when making global config changes. They just call the method, and the framework handles the "how."

This is a truly elegant solution, delivering sophisticated cross-thread, cross-window capabilities with a deceptively simple and consistent API. Excellent work.

