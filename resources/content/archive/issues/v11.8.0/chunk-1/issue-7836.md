---
id: 7836
title: 'Refactor: Robust Hybrid Database Lifecycle for AI Services'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-21T01:31:35Z'
updatedAt: '2025-11-21T02:14:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7836'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-21T02:14:24Z'
---
# Refactor: Robust Hybrid Database Lifecycle for AI Services

**Objective**
Refactor the `DatabaseLifecycleService` and `ChromaManager` to robustly support a hybrid database model (External, Managed, Shared) without race conditions or deadlocks.

**Context**
The current lifecycle implementation (`ai/mcp/server/knowledge-base/services/DatabaseLifecycleService.mjs`) has a potential circular dependency and timing issue:
1.  `DatabaseLifecycleService` waits for `ChromaManager` to be ready.
2.  `ChromaManager` attempts to connect immediately.
3.  If the DB is not running, `ChromaManager` fails to connect, but `DatabaseLifecycleService` hasn't started it yet.

We need to support:
-   **External Mode:** DB started manually in a terminal.
-   **Managed Mode:** Service starts the DB process.
-   **Shared Mode:** Multiple agents/processes sharing one DB instance (first one starts it, others detect it).

**Tasks**
1.  **Decouple Initialization:** `DatabaseLifecycleService` should check for an existing DB *before* waiting for `ChromaManager`.
2.  **Robust Start:** If no DB is detected, start the process and *wait* for the port to be responsive before declaring readiness.
3.  **Service Base Class:** Implement `Neo.ai.ServiceBase` to standardize the `ready()` contract across all services (KB, Memory, GitHub), ensuring consumers (Agents) can just `await Service.ready()`.

**Deliverables**
-   Refactored `DatabaseLifecycleService.mjs` (KB & Memory).
-   Refactored `ChromaManager.mjs` (KB & Memory).
-   New `ai/core/ServiceBase.mjs`.


## Timeline

- 2025-11-21T01:31:37Z @tobiu added the `enhancement` label
- 2025-11-21T01:31:37Z @tobiu added the `ai` label
- 2025-11-21T01:31:37Z @tobiu added the `refactoring` label
- 2025-11-21T02:13:42Z @tobiu assigned to @tobiu
### @tobiu - 2025-11-21T02:13:59Z

**Input from Gemini 3.0 Preview:**

> ✦ I have successfully refactored the AI Service lifecycle to support a robust hybrid database model.
> 
> **Key Changes:**
> 1.  **Eliminated Circular Dependencies:** `DatabaseLifecycleService` no longer statically imports `ChromaManager`. It uses dynamic imports to access the client for heartbeat checks, preventing startup crashes.
> 2.  **Enforced Initialization Order:**
>     -   `DatabaseLifecycleService`: Starts the process and waits for a heartbeat (via `http` or dynamic client).
>     -   `ChromaManager`: Awaits `DatabaseLifecycleService.ready()` before attempting to connect.
>     -   `SessionService` / `DatabaseService`: Await `ChromaManager.ready()` before performing operations.
> 3.  **Simplified Agent SDK:** The `self-healing.mjs` demo now simply awaits `KB_LifecycleService.ready()` and `KB_ChromaManager.ready()` (or just the manager) without manual retry loops.
> 
> This resolves the race conditions and supports external/shared database instances.
> 
> Closing ticket.

- 2025-11-21T02:14:24Z @tobiu closed this issue
- 2025-11-21T08:51:07Z @tobiu referenced in commit `74edfca` - "refactor(ai): Robust Hybrid Database Lifecycle and Roadmap update (#7836)"
- 2025-11-21T09:14:27Z @tobiu cross-referenced by #7837

