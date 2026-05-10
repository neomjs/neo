---
id: 8948
title: 'Epic: Dynamic Worker Architecture & Import Protocol'
state: CLOSED
labels:
  - epic
  - developer-experience
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-02-02T13:59:21Z'
updatedAt: '2026-02-02T22:54:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8948'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 8949 Feat: `Manager.startWorker` Remote Method'
  - '[x] 8950 Refactor: Move `loadModule` to `Neo.worker.Base`'
  - '[x] 8951 Feat: Smart Initialization for SparklineComponent'
  - '[x] 8952 Bug: Dynamic Worker Start triggers Double App Init & Canvas Race Condition'
  - '[x] 8953 Feat: Optional Canvas Worker Entry Point (`useCanvasWorkerStartingPoint`)'
  - '[x] 8954 Feat: Generic Sparkline Component & Grid Column'
  - '[x] 8955 Feat: Migrate Sparkline Renderer to `src/canvas` & Enforce Defaults'
subIssuesCompleted: 7
subIssuesTotal: 7
blockedBy: []
blocking: []
closedAt: '2026-02-02T22:54:50Z'
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
- 2026-02-02T21:39:15Z @tobiu cross-referenced by #8952
- 2026-02-02T21:50:45Z @tobiu added sub-issue #8953
- 2026-02-02T22:39:02Z @tobiu added sub-issue #8954
- 2026-02-02T22:54:15Z @tobiu added sub-issue #8955
### @tobiu - 2026-02-02T22:54:37Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully completed the **Dynamic Worker Architecture & Import Protocol** epic.
> 
> **Achievements:**
> 1.  **Dynamic Worker Orchestration:** Implemented `Neo.worker.Manager.startWorker` (#8949) to allow on-demand spawning of workers (e.g., 'canvas') from the main thread.
> 2.  **Protocol Standardization:** Centralized module loading in `Neo.worker.Base` (#8950), enabling any worker to dynamically import scripts.
> 3.  **Zero-Config Components:** Created `Neo.component.Sparkline` (#8954) and `Neo.canvas.Sparkline` (#8955) as a fully autonomous pair. The component orchestrates the worker start, module load, and renderer registration automatically.
> 4.  **Grid Integration:** Delivered `Neo.grid.column.Sparkline` for seamless usage in data grids.
> 5.  **Robustness:** Solved race conditions (#8952) and made the canvas worker entry point optional (#8953), ensuring existing apps remain stable while new features are "opt-in".
> 
> **Outcome:**
> Developers can now simply use `{type: 'sparkline', dataField: '...'}` in a grid column, and the framework handles the entire multi-threaded complexity (starting the worker, loading the renderer, syncing state) transparently. This significantly improves the Developer Experience (DX) for advanced visualizations.

- 2026-02-02T22:54:50Z @tobiu closed this issue
- 2026-02-02T23:03:33Z @tobiu cross-referenced by #8930

