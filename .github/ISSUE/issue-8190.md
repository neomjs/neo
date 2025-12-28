---
id: 8190
title: 'Feat: Neural Link - Runtime Code Hot-Patching'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2025-12-28T21:26:17Z'
updatedAt: '2025-12-28T21:26:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8190'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Neural Link - Runtime Code Hot-Patching

**Context:**
To support true "Self-Healing" capabilities, agents need a mechanism to apply fixes to the running application without a full reload cycle.

**Scope:**

1.  **Enhance `RuntimeService`:**
    -   Add `patchCode(sessionId, className, methodName, source)`.
    -   Implementation:
        -   Send command to App Worker.
        -   Locate class via `Neo.ns(className)`.
        -   Apply new method: `prototype[methodName] = eval(...)`.
    -   **Security:** This feature MUST be gated behind a `Neo.config.enableHotPatching` flag (default false).

2.  **Tools:**
    -   `patch_code`: Applies the fix.

**Goal:** Enable sub-second self-healing loops for rapid iteration.

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added the `architecture` label
- 2025-12-28 @tobiu added parent issue #8169

