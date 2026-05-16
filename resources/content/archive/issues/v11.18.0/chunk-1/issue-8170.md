---
id: 8170
title: Implement Neural Link Client Core (Tree & Props)
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T13:37:14Z'
updatedAt: '2025-12-28T14:01:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8170'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T14:01:26Z'
---
# Implement Neural Link Client Core (Tree & Props)

Implement the core "Read/Write" primitives in `src/ai/Client.mjs` to enable runtime inspection.

**1. `get_component_tree(rootId, depth)`**
-   **Challenge:** Component trees contain complex objects (Stores, other Components) that are not JSON-serializable.
-   **Strategy:** Implement a safe serializer that:
    -   Walks the tree starting from `rootId` (or Viewport if null).
    -   Respects a `depth` limit to prevent massive payloads.
    -   Replaces complex instances with lightweight descriptors: `{neoInstance: true, id: 'foo', className: 'Neo.bar'}`.

**2. `get_vdom_tree(rootId, depth)`**
-   **Goal:** Retrieve the JSON VDOM structure (blueprint) for a component subtree.
-   **Logic:** Access `component.vdom`.

**3. `get_vnode_tree(rootId, depth)`**
-   **Goal:** Retrieve the live Virtual Node (VNode) structure that mirrors the DOM.
-   **Logic:** Access `component.vnode` (requires fetching from VDom worker or caching).

**4. `get_component_property(id, property)`**
-   **Scope:** "Property" covers both Reactive Configs (accessed via getter/underscore) and standard Class Fields.
-   **Logic:** safely retrieve the value and serialize it for transport.

**5. `set_component_property(id, property, value)`**
-   **Scope:** "Property" covers both Reactive Configs (triggering `set()`) and standard Class Fields.
-   **Logic:**
    -   If it's a config, use `component[property] = value` to trigger reactivity.
    -   If it's a class field, set directly.


## Timeline

- 2025-12-28T13:37:15Z @tobiu added the `enhancement` label
- 2025-12-28T13:37:15Z @tobiu added the `ai` label
- 2025-12-28T13:37:23Z @tobiu added parent issue #8169
- 2025-12-28T13:59:29Z @tobiu assigned to @tobiu
- 2025-12-28T13:59:49Z @tobiu referenced in commit `a598a76` - "Implement Neural Link Client Core (Tree & Props) #8170"
### @tobiu - 2025-12-28T14:00:32Z

**Input from Gemini 3:**

> ✦ **Implementation Complete**
> 
> I have implemented the core read/write primitives for the Neural Link.
> 
> **Changes:**
> 1.  **OpenAPI Spec (`ai/mcp/server/neural-link/openapi.yaml`)**:
>     *   Added endpoints: `/component/vdom/get` and `/component/vnode/get`.
>     *   Updated `get_component_tree` schema to accept optional `rootId` (defaults to MainView) and `depth` (1-based).
> 
> 2.  **Server (`ConnectionService.mjs` & `toolService.mjs`)**:
>     *   Implemented `getVdomTree` and `getVnodeTree`.
>     *   Mapped new tools to the service.
> 
> 3.  **Client (`src/ai/Client.mjs`)**:
>     *   Implemented `handleRequest` dispatching.
>     *   Added `getComponentRoot(rootId)` helper for intelligent defaulting.
>     *   Added `serializeComponent` with depth control and `items` traversal.
>     *   Added `safeSerialize` for property values to handle Neo instances and circular references.
> 
> **Verification:**
> *   Ran `test_connection_service.mjs` to verify server startup and method existence. Passed.
> 
> Ready for review.

- 2025-12-28T14:01:27Z @tobiu closed this issue

