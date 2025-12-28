---
id: 8189
title: 'Feat: Neural Link - Advanced Event Simulation'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-28T21:19:33Z'
updatedAt: '2025-12-28T21:19:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8189'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Neural Link - Advanced Event Simulation

**Context:**
Agents need to verify interactions beyond simple clicks. Simulating keyboard events and complex mouse actions is critical for E2E testing.

**Scope:**

1.  **Create Main Thread Addon:** `src/main/addon/EventSimulator.mjs`.
    -   Expose remote methods: `dispatch(nodeId, eventConfig)`.
    -   Logic: Use `new KeyboardEvent()`, `new MouseEvent()`, etc., and `element.dispatchEvent()`.

2.  **Enhance `InteractionService`:**
    -   Add `simulateEvent(sessionId, targetId, options)`.
    -   Implementation: Call `Neo.main.addon.EventSimulator.dispatch`.

3.  **Tools:**
    -   `simulate_event`: Generic dispatcher.

**Goal:** Enable comprehensive interaction testing via a new main thread addon.

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added parent issue #8169

