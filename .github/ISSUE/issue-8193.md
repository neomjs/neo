---
id: 8193
title: 'Feat: Neural Link - Namespace Discovery'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2025-12-28T21:37:35Z'
updatedAt: '2025-12-28T21:37:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8193'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Neural Link - Namespace Discovery

**Context:**
Agents need to know which classes are currently loaded in the App Worker to safely construct JSON blueprints or call static methods.

**Scope:**

1.  **Enhance `RuntimeService`:**
    -   Add `getNamespaceTree(sessionId, root)`.
    -   Add `checkNamespace(sessionId, namespace)`.

2.  **Tools:**
    -   `get_namespace_tree`: Returns the loaded class hierarchy.
    -   `check_namespace`: Accepts a string (e.g., "Neo.button.Base"). Returns boolean.

**Goal:** Enable agents to discover and verify available classes.

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added the `architecture` label
- 2025-12-28 @tobiu added parent issue #8169

