---
id: 8948
title: 'Epic: Dynamic Worker Architecture & Import Protocol'
state: OPEN
labels:
  - epic
  - developer-experience
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-02-02T13:59:21Z'
updatedAt: '2026-02-02T14:29:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8948'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 8949 Feat: `Manager.startWorker` Remote Method'
  - '[x] 8950 Refactor: Move `loadModule` to `Neo.worker.Base`'
  - '[x] 8951 Feat: Smart Initialization for SparklineComponent'
  - '[ ] 8952 Bug: Dynamic Worker Start triggers Double App Init & Canvas Race Condition'
subIssuesCompleted: 3
subIssuesTotal: 4
blockedBy: []
blocking: []
---
# Epic: Dynamic Worker Architecture & Import Protocol

This epic covers the implementation of a "Dynamic Import Protocol" and "Auto-Initializing Workers" to significantly improve the Developer Experience (DX) for worker-based components (like `Sparkline`, `Canvas`).

**Goal:**
Enable developers to drop in advanced, worker-backed components without requiring manual configuration (`useCanvasWorker: true`) or boilerplate code (`canvas.mjs`).

**Strategy:**
1.  **On-Demand Worker Start:** The Main Thread (`Neo.worker.Manager`) will expose a method to start workers (e.g., 'canvas') dynamically if they are not already running.
2.  **Dynamic Module Loading:** The `Neo.worker.Base` class will expose a `loadModule` method, allowing any worker to import scripts (renderers) at runtime.
3.  **Smart Component Logic:** Components will orchestrate this process: "Start Worker" -> "Load Renderer" -> "Register".

**Roadmap:**
- [ ] **Feat: `Manager.startWorker`:** Implement the main thread logic to spawn workers on demand.
- [ ] **Refactor: `worker.Base.loadModule`:** Centralize module loading logic in the base worker class.
- [ ] **Feat: Smart Initialization:** Update `SparklineComponent` (as a PoC) to auto-initialize its environment.
- [ ] **Feat: Generic Sparkline Column:** Create a `Neo.grid.column.Sparkline` that wraps this logic for easy grid integration.

## Timeline

- 2026-02-02T13:59:23Z @tobiu added the `epic` label
- 2026-02-02T13:59:23Z @tobiu added the `developer-experience` label
- 2026-02-02T13:59:23Z @tobiu added the `ai` label
- 2026-02-02T13:59:23Z @tobiu added the `architecture` label
- 2026-02-02T14:00:28Z @tobiu added sub-issue #8949
- 2026-02-02T14:00:52Z @tobiu added sub-issue #8950
- 2026-02-02T14:01:18Z @tobiu added sub-issue #8951
- 2026-02-02T14:29:53Z @tobiu assigned to @tobiu
- 2026-02-02T21:31:38Z @tobiu added sub-issue #8952

