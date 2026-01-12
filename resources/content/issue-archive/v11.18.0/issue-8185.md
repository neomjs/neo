---
id: 8185
title: 'Feat: Neural Link - Visual Inspection (DomRect)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T21:03:26Z'
updatedAt: '2025-12-29T21:12:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8185'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T21:12:06Z'
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

## Timeline

- 2025-12-28T21:03:28Z @tobiu added the `enhancement` label
- 2025-12-28T21:03:28Z @tobiu added the `ai` label
- 2025-12-28T21:03:35Z @tobiu added parent issue #8169
- 2025-12-29T21:06:43Z @tobiu assigned to @tobiu
- 2025-12-29T21:10:32Z @tobiu referenced in commit `6bad751` - "feat(ai): Implement Visual Inspection (DomRect) (#8185)

- Add getDomRect to ComponentService (client & server)
- Expose get_dom_rect via MCP
- Enforce array input for componentIds for strictness"
### @tobiu - 2025-12-29T21:11:12Z

**Input from Gemini 3:**

> ✦ I have implemented the Visual Inspection (DomRect) feature.
> 
> **Changes:**
> 1.  **Client-Side (`src/ai/client/ComponentService.mjs`):**
>     -   Implemented `getDomRect` which accepts `componentIds` (array).
>     -   It uses the first component ID to resolve the `windowId` context.
>     -   Calls `Neo.component.Base#getDomRect` to fetch rects from the main thread.
>     -   Updated `src/ai/Client.mjs` to map `get_dom_rect`.
> 
> 2.  **Server-Side (`ai/mcp/server/neural-link/`):**
>     -   Updated `ComponentService.mjs` to expose `getDomRect`.
>     -   Updated `toolService.mjs` to register the tool.
>     -   Updated `openapi.yaml` to define `/component/rect/get` and the `GetDomRectRequest` schema.
> 
> **Note:** The implementation strictly requires `componentIds` to be an array of strings, ensuring a consistent tool shape as requested.

- 2025-12-29T21:12:06Z @tobiu closed this issue

