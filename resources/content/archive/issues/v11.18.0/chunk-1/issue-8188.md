---
id: 8188
title: 'Feat: Neural Link - Visual Highlighting'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T21:16:41Z'
updatedAt: '2025-12-29T23:24:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8188'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T23:24:43Z'
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

## Timeline

- 2025-12-28T21:16:42Z @tobiu added the `enhancement` label
- 2025-12-28T21:16:42Z @tobiu added the `ai` label
- 2025-12-28T21:16:50Z @tobiu added parent issue #8169
- 2025-12-29T23:23:55Z @tobiu referenced in commit `0f2bf7d` - "feat(ai): Implement visual component highlighting (#8188)

- Add highlightComponent to ComponentService (client)
- Expose highlight_component via Client.mjs
- Add highlightComponent to InteractionService (server)
- Update OpenAPI spec with /component/highlight"
- 2025-12-29T23:24:43Z @tobiu closed this issue
- 2025-12-29T23:24:57Z @tobiu assigned to @tobiu

