---
id: 8311
title: 'Feat: Neural Link - Configurable URL & Graceful Connection'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-04T13:34:40Z'
updatedAt: '2026-01-04T13:35:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8311'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Neural Link - Configurable URL & Graceful Connection

**Context:**
1.  **Hardcoded URL:** `Neo.ai.Client` currently defaults to `ws://localhost:8081`. Developers need a convenient way to configure this (e.g., `neo-config.json`) without creating class overrides.
2.  **Connection Safety:** When `useAiClient` is enabled, connection attempts should be robust. If the WebSocket instantiation fails (e.g., invalid URL scheme), it should not crash the worker.

**Scope:**
1.  **Update `src/DefaultConfig.mjs`:**
    -   Add `neuralLinkUrl` (default: `'ws://localhost:8081'`).
2.  **Update `src/ai/Client.mjs`:**
    -   Use `Neo.config.neuralLinkUrl` in `connect()`.
    -   Wrap the connection logic in a `try-catch` block to handle synchronous errors (e.g. URL syntax) gracefully.

**Goal:**
Make Neural Link configuration more flexible and runtime-safe.

## Activity Log

- 2026-01-04 @tobiu added the `enhancement` label
- 2026-01-04 @tobiu added the `ai` label
- 2026-01-04 @tobiu added the `architecture` label
- 2026-01-04 @tobiu added parent issue #8169
- 2026-01-04 @tobiu assigned to @tobiu

