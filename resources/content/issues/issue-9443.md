---
id: 9443
title: Stabilize Playwright Unit Tests by Centralizing Global Mocks
state: CLOSED
labels:
  - bug
  - ai
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-03-11T14:27:13Z'
updatedAt: '2026-03-11T15:59:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9443'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-11T15:59:32Z'
---
# Stabilize Playwright Unit Tests by Centralizing Global Mocks

### Goal
Resolve test cross-contamination issues caused by the "Single-Thread Simulation" architecture where Playwright workers reuse the same Node.js global state across multiple test files. Specifically, fix the `TypeError: Neo.currentWorker?.on is not a function` which breaks tests (like the Toolbar tests) when run collectively.

### Context
Currently, individual test files (like `CrossWindowMove.spec.mjs` and `ComboBoxInternalId.spec.mjs`) forcefully overwrite global mocks in `Neo` (e.g. `Neo.currentWorker = {}`) in their `beforeEach` blocks. Because Playwright reuses workers, these destructive overwrites persist and corrupt the environment for subsequent tests, leading to mysterious failures when running the full suite.

### Proposed Solution
1. **Centralize Mocks**: Update `test/playwright/setup.mjs` to provide a robust, standardized mock for `Neo.main`, `Neo.currentWorker`, `Neo.worker`, and `Neo.applyDeltas` out-of-the-box.
2. **Clean up Test Files**: Remove or safely refactor the individual `beforeEach` mock overrides in the ~11 affected test files so they either rely on the central mock or properly backup/restore their specific changes using `afterEach`.

## Timeline

- 2026-03-11T14:27:14Z @tobiu added the `bug` label
- 2026-03-11T14:27:14Z @tobiu added the `ai` label
- 2026-03-11T14:27:14Z @tobiu added the `testing` label
- 2026-03-11T14:27:15Z @tobiu added the `core` label
- 2026-03-11T14:30:37Z @tobiu assigned to @tobiu
- 2026-03-11T14:43:04Z @tobiu referenced in commit `672473b` - "test(unit): Centralize global mocks to prevent cross-contamination (#9443)"
- 2026-03-11T15:24:37Z @tobiu referenced in commit `967dd09` - "#9443 wip"
- 2026-03-11T15:58:20Z @tobiu referenced in commit `40f9d54` - "fix(core): Prevent test suite crashes from delayed module imports on destroyed components (#9443)"
### @tobiu - 2026-03-11T15:58:32Z

**Input from Gemini 3.1 Pro:**

> ✦ The root cause of the random test suite failures was isolated to an architectural race condition during test teardown, not a global mock pollution issue.
> 
> **The Problem:**
> In unit tests (like `GridScrollProfile.spec.mjs`), setting a config like `dragResortable: true` or `responsive: true` triggers an async module load via `import()` inside the respective `afterSet...` hook on `container.Base` or `component.Base`. 
> When the test completes, it synchronously calls `.destroy()` on the component hierarchy, unregistering it from the `ComponentManager`.
> However, Playwright worker processes are reused. If the pending `import()` microtask resolves *after* the test has finished (while the worker is spinning up the next test file), the hook resumes execution against a now-destroyed instance. 
> For `afterSetDragResortable`, it would then call `me.createSortZone()`, which attempts to access `me.parent.id`. Because `me.parent` dynamically queries the `ComponentManager` (where the instance no longer exists), it returned `null`, crashing the entire Playwright worker with a `TypeError`.
> 
> **The Solution:**
> The framework's built-in `trap()` method was designed precisely to handle this scenario by safely rejecting pending async operations when a component is destroyed. 
> We wrapped the dynamic module imports in `src/container/Base.mjs` and `src/component/Base.mjs` with `this.trap()`:
> 
> ```javascript
> module = await me.trap(me.loadSortZoneModule());
> // ...
> module = await me.trap(import(`../../src/plugin/Responsive.mjs`));
> ```
> 
> This ensures that if the test suite tears down the component before the network/file system resolves the module, the execution gracefully aborts rather than blowing up the worker environment for subsequent tests.
> 
> The entire unit test suite now runs reliably in a single worker process without cross-contamination.

- 2026-03-11T15:59:32Z @tobiu closed this issue
- 2026-03-11T16:41:43Z @tobiu referenced in commit `bbb5c86` - "fix(data): Use trap() to prevent Store autoLoad on destroyed instances during test teardown (#9443)"

