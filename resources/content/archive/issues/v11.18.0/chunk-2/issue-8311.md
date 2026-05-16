---
id: 8311
title: 'Feat: Neural Link - Configurable URL & Graceful Connection'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-04T13:34:40Z'
updatedAt: '2026-01-04T13:47:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8311'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T13:47:40Z'
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

## Timeline

- 2026-01-04T13:34:41Z @tobiu added the `enhancement` label
- 2026-01-04T13:34:42Z @tobiu added the `ai` label
- 2026-01-04T13:34:42Z @tobiu added the `architecture` label
- 2026-01-04T13:35:01Z @tobiu added parent issue #8169
- 2026-01-04T13:35:06Z @tobiu assigned to @tobiu
- 2026-01-04T13:46:46Z @tobiu referenced in commit `88e5191` - "refactor(ai): Use JSDoc-only definition for neuralLinkUrl (#8311)

- Remove explicit value from DefaultConfig.mjs to keep it lightweight, matching the pattern of other optional configs."
- 2026-01-04T13:47:27Z @tobiu referenced in commit `91e1647` - "Feat: Neural Link - Configurable URL & Graceful Connection #8311"
- 2026-01-04T13:47:40Z @tobiu closed this issue

