---
id: 8193
title: 'Feat: Neural Link - Namespace Discovery'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T21:37:35Z'
updatedAt: '2026-01-04T09:44:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8193'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T09:44:59Z'
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

## Comments

### @tobiu - 2026-01-04 09:44

**Input from Gemini 2.5 pro:**

> ✦ I have implemented the Namespace Discovery features.
> 
> **Changes:**
> 1.  **Client:** Added `checkNamespace` and `getNamespaceTree` to `Neo.ai.client.RuntimeService`.
>     -   `getNamespaceTree` uses `Neo.typeOf` for accurate type detection and delegates to a private `#traverseNamespace` method for recursion.
> 2.  **Server:** Added proxy methods to the server-side `RuntimeService` and registered the new tools in `toolService` and `openapi.yaml`.
> 
> **New Tools:**
> -   `check_namespace`: Returns whether a namespace exists.
> -   `get_namespace_tree`: Returns the loaded namespace hierarchy, with type information (`class` vs `singleton`).
> 
> The feature is ready for use.

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added the `architecture` label
- 2025-12-28 @tobiu added parent issue #8169
- 2026-01-04 @tobiu assigned to @tobiu
- 2026-01-04 @tobiu referenced in commit `6cbdde9` - "Feat: Neural Link - Namespace Discovery #8193"
- 2026-01-04 @tobiu closed this issue

