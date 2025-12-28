---
id: 8185
title: 'Feat: Neural Link - Visual Inspection (DomRect)'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-28T21:03:26Z'
updatedAt: '2025-12-28T21:03:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8185'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Neural Link - Visual Inspection (DomRect)

**Context:**
Agents need to understand the physical layout of components to debug visibility and interaction issues. `component.Base` provides a powerful `getDomRect` method that can fetch one or many rects.

**Scope:**

1.  **Enhance `ComponentService`:**
    -   Add `getDomRect(sessionId, componentIds)`.
    -   Implementation: Trigger `Neo.getComponent(id).getDomRect(componentIds)`.
    -   Ensure the response is always normalized to an array of `DOMRect` objects.

2.  **Tools:**
    -   `get_dom_rect`: Accepts `componentId` (string) OR `componentIds` (array of strings). **Always returns an array of `DOMRect` objects.**

**Goal:** Provide bulk physical layout inspection capabilities.

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added parent issue #8169

