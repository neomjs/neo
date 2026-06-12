---
id: 9833
title: 'Refactor InferenceLifecycleService: Abstract spawn logic and integrate headless LM Studio auto-boot'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-04-09T19:16:39Z'
updatedAt: '2026-04-09T19:17:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9833'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T19:17:17Z'
---
# Refactor InferenceLifecycleService: Abstract spawn logic and integrate headless LM Studio auto-boot

### Architectural Context
The `InferenceLifecycleService` previously suffered from significant Promise/spawn boilerplate duplication across multiple local inference providers (Ollama, MLX). Furthermore, it failed to support autonomous headless initialization for LM Studio (`1234`), forcing manual GUI interaction upon agent OS reboots.

### Implementation
1. **Abstracted Spawn Logic:** Consolidated the repetitive `child_process.spawn` and event-listener blocks into a unified `spawnInferenceProcess(cmd, args, name)` utility method.
2. **Integrated LM Studio Auto-Boot:** Added native auto-boot support for port `1234` utilizing the LM Studio CLI (`lms server start`).
3. **Preserved Ollama / MLX:** Restored and retrofitted Ollama and MLX to utilize the new abstract method, ensuring backward compatibility for the broader user base.
4. **Collision Defense Verification:** Validated that the existing `isInferenceRunning()` HTTP check correctly prevents zombie process duplication across all underlying engines by gracefully short-circuiting the spawn cycle if the port is already active.

### Avoided Pitfalls
- **TCP Socket Contention:** Duplication fears were mitigated by leveraging the native OS-level socket closures embedded within `lms`, `ollama`, and the `mlx` Python daemon.
- **Port Masking:** Prevented accidental port collisions by strictly gating the LM Studio spawn behind the explicit `1234` check, separating it from Ollama's `11434` namespace.

## Timeline

- 2026-04-09T19:16:40Z @tobiu added the `enhancement` label
- 2026-04-09T19:16:40Z @tobiu added the `ai` label
- 2026-04-09T19:16:40Z @tobiu added the `refactoring` label
- 2026-04-09T19:16:48Z @tobiu referenced in commit `0a3812c` - "feat: Refactor InferenceLifecycleService spawn logic (#9833)"
- 2026-04-09T19:16:55Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T19:17:10Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Completed via commit 0a3812c4c. 
> 
> The `InferenceLifecycleService` has been successfully refactored. The unified `spawnInferenceProcess()` method is implemented and autonomous headless support for the LM Studio CLI (port `1234`) is active alongside retrofitted Ollama/MLX paths. 
> 
> Verified the `isInferenceRunning()` HTTP check natively handles duplicated port contention across all engine providers.

- 2026-04-09T19:17:17Z @tobiu closed this issue

