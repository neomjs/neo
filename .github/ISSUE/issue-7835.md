---
id: 7835
title: 'Refactor: Standardize AI Service Lifecycle with ServiceBase'
state: OPEN
labels:
  - enhancement
  - developer-experience
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-21T01:16:52Z'
updatedAt: '2025-11-21T01:16:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7835'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: Standardize AI Service Lifecycle with ServiceBase

**Objective**
Standardize the initialization and readiness lifecycle across all AI services by introducing a common base class (`Neo.ai.ServiceBase`). This will ensure a consistent `initAsync()` and `ready()` pattern, simplifying agent scripts and reducing boilerplate.

**Context**
Currently, agent scripts must manually handle different initialization logic for Knowledge Base, Memory, and GitHub services (e.g., waiting for ChromaDB heartbeats, checking API keys). A standardized base class will encapsulate this logic.

**Tasks**
1.  **Create Base Class:** Implement `Neo.ai.ServiceBase` with standard `initAsync`, `ready()`, and `healthcheck()` contract.
2.  **Refactor Services:** Update existing services (`DatabaseService`, `QueryService`, `MemoryService`, etc.) to extend this base class.
3.  **Enforce Pattern:** Ensure all services strictly adhere to the `await service.ready()` usage pattern.
4.  **Verify:** Update `ai/examples/self-healing.mjs` to use the cleaner, standardized initialization.

**Deliverables**
-   `ai/core/ServiceBase.mjs` (New Base Class)
-   Refactored Service files.
-   Updated Demo Script.


## Activity Log

- 2025-11-21 @tobiu added the `enhancement` label
- 2025-11-21 @tobiu added the `developer-experience` label
- 2025-11-21 @tobiu added the `ai` label
- 2025-11-21 @tobiu added the `refactoring` label

