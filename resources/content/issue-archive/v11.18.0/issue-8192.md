---
id: 8192
title: 'Feat: Neural Link - Log & Error Streaming'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T21:32:41Z'
updatedAt: '2026-01-03T22:15:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8192'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T22:15:35Z'
---
# Feat: Neural Link - Log & Error Streaming

**Context:**
Agents are "blind" to runtime errors they trigger. They need to see the App Worker's console output and exceptions to self-correct.

**Scope:**

1.  **App Worker Enhancement:**
    -   Implement a log interceptor (hook `console.*` and `globalThis.onerror`).
    -   Forward logs to Main Thread -> Neural Link.

2.  **Neural Link Server Enhancement:**
    -   `ConnectionService`: Receive log messages. Store in a ring buffer (e.g., last 1000 logs per session).
    -   **Tool:** `get_console_logs(sessionId, filter)`. Returns the logs.
    -   **Streaming:** Optionally, explore MCP Notifications to push logs to the agent in real-time.

**Goal:** Provide runtime observability to the agent.

## Timeline

- 2025-12-28T21:32:42Z @tobiu added the `enhancement` label
- 2025-12-28T21:32:42Z @tobiu added the `ai` label
- 2025-12-28T21:32:42Z @tobiu added the `architecture` label
- 2025-12-28T21:32:49Z @tobiu added parent issue #8169
- 2026-01-03T22:00:07Z @tobiu assigned to @tobiu
- 2026-01-03T22:14:51Z @tobiu referenced in commit `329a296` - "feat(ai): Implement Neural Link Log & Error Streaming (#8192)

- App Worker: Implement interceptConsole to forward logs/errors to Neural Link.
- ConnectionService: Implement log ring buffer and getConsoleLogs tool.
- OpenAPI: Add /console/logs/get endpoint."
### @tobiu - 2026-01-03T22:15:12Z

**Input from Gemini:**

> ✦ I have implemented the Log & Error Streaming feature.
> 
> **Changes:**
> 1.  **App Worker (`src/worker/App.mjs`):** Added `interceptConsole` method which hooks into `console.log`, `warn`, `error`, `info` and `globalThis.onerror`. These are forwarded to the Neural Link via `Neo.ai.Client`.
> 2.  **Server (`ConnectionService.mjs`):** Implemented a ring buffer (size 1000) per session to store incoming `console_log` notifications. Added `getConsoleLogs` method supporting type and message filtering.
> 3.  **Tool (`toolService.mjs`):** Exposed `get_console_logs` tool.
> 4.  **OpenAPI:** Updated spec with the new endpoint.
> 
> **Capability:**
> Agents can now verify runtime errors or inspect application logs to self-diagnose issues using `get_console_logs`.

- 2026-01-03T22:15:36Z @tobiu closed this issue

