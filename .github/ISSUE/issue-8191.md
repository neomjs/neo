---
id: 8191
title: 'Feat: Neural Link - Global Config Management'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-28T21:30:46Z'
updatedAt: '2025-12-28T21:30:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8191'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Neural Link - Global Config Management

**Context:**
`Neo.config` controls framework-level behavior. While some configs are boot-time constants (e.g., `useSharedWorkers`, `environment`), others are runtime-mutable (e.g., `themes`, custom app flags). Agents need access to this system.

**Scope:**

1.  **Enhance `RuntimeService`:**
    -   Add `getNeoConfig(sessionId)`.
        -   Implementation: Return `Neo.config`.
    -   Add `setNeoConfig(sessionId, config)`.
        -   Implementation: Call `Neo.setGlobalConfig(config)`.

2.  **Tools:**
    -   `get_neo_config`: Returns the `Neo.config` object.
    -   `set_neo_config`: Accepts a partial config object.
    -   **Documentation:** Explicitly warn that changing boot-time configs (workers, environment) at runtime may not work or could cause instability.

**Goal:** Enable runtime configuration management.

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added parent issue #8169

