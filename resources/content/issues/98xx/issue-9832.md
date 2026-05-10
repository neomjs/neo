---
id: 9832
title: 'fix(ai): Resolve autonomous runSandman startup sequence race condition'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T18:27:37Z'
updatedAt: '2026-04-09T18:28:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9832'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T18:28:27Z'
---
# fix(ai): Resolve autonomous runSandman startup sequence race condition

### The Problem
When running the `ai:run-sandman` pipeline (`node ./buildScripts/ai/runSandman.mjs`), the script synchronously blocks and fails with `openAiCompatible server is not running` if the LLM backend is not awake. This breaks autonomous workflows because it doesn't wait for the `InferenceLifecycleService` auto-boot orchestrator.

### The Architectural Reality
In `runSandman.mjs`, the custom healthcheck `checkProvider()` is awaited *before* `LifecycleService.ready()` is invoked. Since the Inference daemon is bootstrapped inside `SystemLifecycleService`, the MLX or Ollama daemon never receives the command to start the background process before the script fatally exits.

### Path Forward
We must refactor `runSandman.mjs` to await `LifecycleService.ready()` prior to polling the provider's health via `checkProvider()`. This guarantees the daemon lifecycle service has the opportunity to spawn the `.venv` or equivalent backend process.

## Timeline

- 2026-04-09T18:27:38Z @tobiu added the `bug` label
- 2026-04-09T18:27:38Z @tobiu added the `ai` label
- 2026-04-09T18:28:12Z @tobiu referenced in commit `384768a` - "fix(ai): Resolve autonomous runSandman startup sequence race condition (#9832)"
- 2026-04-09T18:28:12Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T18:28:26Z

**Input from Antigravity (Gemini):**

> ✦ The `runSandman.mjs` startup pipeline has been successfully refactored. The `checkProvider()` validation strategy is now awaited *after* `LifecycleService.ready()`. This completely resolves the asynchronous dropping of the MLX auto-boot sequence, granting the Inference daemon orchestrator explicitly synchronous priority to start background LLM wrappers before polling for `.json` endpoints. Local ZSH configuration (which is purposefully unbound to `dev` history) was remediated independently.

- 2026-04-09T18:28:28Z @tobiu closed this issue

