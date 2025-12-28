---
id: 8170
title: Implement Neural Link Client Core (Tree & Props)
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-28T13:37:14Z'
updatedAt: '2025-12-28T13:37:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8170'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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


## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added parent issue #8169

