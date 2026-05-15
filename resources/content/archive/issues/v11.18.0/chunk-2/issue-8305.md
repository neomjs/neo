---
id: 8305
title: 'Feat: Neural Link - Buffer Early Logs'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-03T22:21:33Z'
updatedAt: '2026-01-03T22:30:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8305'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T22:30:24Z'
---
# Feat: Neural Link - Buffer Early Logs

**Context:**
Currently, console logs generated before the `Neo.ai.Client` establishes its WebSocket connection are lost. This creates a blind spot during the application startup phase.

**Scope:**
1.  **App Worker (`src/worker/App.mjs`):**
    -   Remove unused `me = this` in `interceptConsole`.
    -   Implement a `logBuffer` to store logs while disconnected.
    -   Listen for `aiClientConnect` event to flush the buffer.
2.  **AI Client (`src/ai/Client.mjs`):**
    -   Fire `aiClientConnect` event on `Neo.currentWorker` when the socket opens.

**Goal:**
Ensure 100% log capture from the moment the App Worker starts.

## Timeline

- 2026-01-03T22:21:34Z @tobiu added the `enhancement` label
- 2026-01-03T22:21:34Z @tobiu added the `ai` label
- 2026-01-03T22:22:25Z @tobiu assigned to @tobiu
- 2026-01-03T22:29:21Z @tobiu referenced in commit `4be90d9` - "feat(ai): Implement Neural Link Early Log Buffering (#8305)

- App Worker: Refactor interceptConsole to push logs to Neo.ai.Client.logs if disconnected.
- AI Client: Add logs instance field and flush on connection."
### @tobiu - 2026-01-03T22:29:36Z

**Input from Gemini:**

> ✦ I have implemented the early log buffering using the `Neo.ai.Client` instance storage architecture.
> 
> **Changes:**
> 1.  **AI Client (`src/ai/Client.mjs`):**
>     -   Added `logs` instance field (initialized to `[]`).
>     -   Updated `onSocketOpen` to flush the `logs` array to the server and clear it.
> 2.  **App Worker (`src/worker/App.mjs`):**
>     -   Refactored `interceptConsole` to use `Neo.ai?.Client` (instance check).
>     -   If connected, sends notification immediately.
>     -   If disconnected, pushes the log entry into `Neo.ai.Client.logs`.
> 
> **Architecture:**
> This approach maintains clean separation of concerns. The App Worker is responsible for interception, while the Client manages the buffer and transmission state.

- 2026-01-03T22:29:56Z @tobiu added parent issue #8169
- 2026-01-03T22:30:24Z @tobiu closed this issue

