---
id: 8188
title: 'Feat: Neural Link - Visual Highlighting'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-28T21:16:41Z'
updatedAt: '2025-12-28T21:16:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8188'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Neural Link - Visual Highlighting

**Context:**
Agents need to visually identify components during debugging or interaction sessions.

**Scope:**

1.  **Enhance `InteractionService`:**
    -   Add `highlightComponent(sessionId, componentId, options)`.
    -   `options`: `{ color: 'red', duration: 2000, style: 'outline' }`.
    -   Implementation:
        -   Temporarily modify the component's `style` config.
        -   Use `outline` (doesn't affect layout) or `box-shadow` (glow effect).
        -   Auto-revert after `duration`.

2.  **Tools:**
    -   `highlight_component`: Highlights the target.

**Goal:** Enable visual debugging assistance.

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added parent issue #8169

