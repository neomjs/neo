---
id: 9939
title: 'Epic: Autonomous Worker Dispatcher Pipeline (RLAIF Phase 2)'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-12T18:58:53Z'
updatedAt: '2026-04-12T18:59:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9939'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Epic: Autonomous Worker Dispatcher Pipeline (RLAIF Phase 2)

### Context
The `DreamService` (Sandman) pipeline is now structurally stabilized and successfully calculating the `Mathematical Golden Path` at the end of the REM sleep cycle. The background daemon formally outputs `sandman_handoff.md` populated with the top priority `OPEN` issue mapped dynamically against the system's current vector context.

### Scope
We must implement the `Agent Dispatcher` orchestrator. This service will act as the native bridge from REM Sleep back to Active Execution by:
1. Natively reading `sandman_handoff.md`.
2. Extracting the `Target Node ID` context.
3. Spawning headless, autonomous V8 agent instances (Dev Agent / QA Agent) sequentially to execute the top priority context dynamically without human prompts.
4. Feeding the results into the Automated Playwright Evaluator (#9905) for reward propagation.

### Origin Session
Origin Session ID: af26000d-914a-4eb0-8d28-2c09e9cb4cb5

## Timeline

- 2026-04-12T18:58:54Z @tobiu added the `epic` label
- 2026-04-12T18:58:54Z @tobiu added the `ai` label
- 2026-04-12T18:58:54Z @tobiu added the `architecture` label
- 2026-04-12T18:59:00Z @tobiu assigned to @tobiu

