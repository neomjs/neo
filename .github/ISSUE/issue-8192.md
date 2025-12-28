---
id: 8192
title: 'Feat: Neural Link - Log & Error Streaming'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2025-12-28T21:32:41Z'
updatedAt: '2025-12-28T21:32:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8192'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added the `architecture` label
- 2025-12-28 @tobiu added parent issue #8169

