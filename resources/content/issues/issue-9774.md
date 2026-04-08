---
id: 9774
title: Refactor AI SDK and Build Scripts for Memory Core Module Decoupling
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-04-07T22:40:30Z'
updatedAt: '2026-04-07T22:42:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9774'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T22:42:50Z'
---
# Refactor AI SDK and Build Scripts for Memory Core Module Decoupling

### Problem
The legacy `DatabaseLifecycleService` inside the Memory Core was recently decoupled into `ChromaLifecycleService` and `InferenceLifecycleService`. Several downstream consumers across `buildScripts/ai/` and `ai/examples/` were left statically referencing the deleted service, breaking core SDK functions.

### Solution
1. Introduce a facade `SystemLifecycleService` inside `memory-core/services/lifecycle` that orchestrates both internal services.
2. Export this orchestrator via `ai/services.mjs` as `Memory_LifecycleService` to preserve compatibility.
3. Update hardcoded static imports across all build scripts and examples.

## Timeline

- 2026-04-07T22:40:31Z @tobiu added the `enhancement` label
- 2026-04-07T22:40:31Z @tobiu added the `ai` label
- 2026-04-07T22:40:31Z @tobiu added the `build` label
- 2026-04-07T22:40:36Z @tobiu assigned to @tobiu
- 2026-04-07T22:42:37Z @tobiu referenced in commit `22c5db8` - "refactor: Orchestrate Memory Core startup via SystemLifecycleService facade (#9774)"
### @tobiu - 2026-04-07T22:42:49Z

Refactored the Memory Core AI SDK downstream references by establishing a `SystemLifecycleService` facade, protecting downstream consumers. Modified integration code locally and verified startup dependencies across build scripts and examples.

- 2026-04-07T22:42:51Z @tobiu closed this issue
- 2026-04-07T23:27:18Z @tobiu referenced in commit `0e32592` - "test(mcp): resolve concurrent _initPromise yield bypass race during parallel worker Playwright execution (#9774)"
- 2026-04-07T23:27:19Z @tobiu referenced in commit `15e3c95` - "chore(mcp): align ChromaLifecycleService JSDocs and extract registerCleanup (#9774)"

