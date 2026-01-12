---
id: 8308
title: 'Neural Link: Implement atomic get_vdom_and_vnode tool'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-04T11:47:13Z'
updatedAt: '2026-01-04T12:02:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8308'
author: tobiu
commentsCount: 2
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T12:02:30Z'
---
# Neural Link: Implement atomic get_vdom_and_vnode tool

We need a new tool to retrieve both the VDOM and VNode trees for a component in a single, atomic operation.

**Context:**
- `get_vdom_tree` returns the next intended state (VDOM).
- `get_vnode_tree` returns the current live DOM state (VNode).
- `get_component_tree` returns the Neo.mjs component hierarchy (Class instances).

**Problem:**
In high-frequency scenarios (e.g., 60fps), fetching VDOM and VNode via separate network calls can lead to race conditions where the returned trees correspond to different render frames. This mismatch makes debugging rendering issues (reconciliation bugs) impossible.

**Requirements:**
1.  **New Tool:** `get_vdom_vnode` (or `get_render_trees`)
2.  **Atomic:** Must fetch both trees synchronously from the same component instance in the App Worker.
3.  **Parameters:** `rootId` (string), `depth` (number, default -1).
4.  **Output:** `{ vdom: Object, vnode: Object }`.

**Implementation:**
-   **Client:** `src/ai/client/ComponentService.mjs` -> `getVdomAndVnode({rootId, depth})`.
-   **Server:** Update `openapi.yaml`, `toolService.mjs`, and `server/services/ComponentService.mjs`.


## Timeline

- 2026-01-04T11:47:14Z @tobiu added the `enhancement` label
- 2026-01-04T11:47:15Z @tobiu added the `ai` label
- 2026-01-04T11:47:31Z @tobiu assigned to @tobiu
- 2026-01-04T11:47:42Z @tobiu added parent issue #8169
- 2026-01-04T11:52:45Z @tobiu referenced in commit `432bd94` - "Neural Link: Implement atomic get_vdom_and_vnode tool #8308"
### @tobiu - 2026-01-04T11:52:49Z

**Input from Gemini 3 pro:**

> ✦ I have implemented the atomic `get_vdom_vnode` tool across the full stack.
> 
> **Server Side:**
> - **OpenAPI:** Added `/component/vdom-vnode/get` endpoint to `openapi.yaml`.
> - **Service:** Added `getVdomAndVnode` to `ai/mcp/server/neural-link/services/ComponentService.mjs`.
> - **Tool Mapping:** Mapped `get_vdom_vnode` to `ComponentService.getVdomAndVnode` in `ai/mcp/server/neural-link/services/toolService.mjs`.
> 
> **Client Side:**
> - **Service:** Added `getVdomAndVnode` to `src/ai/client/ComponentService.mjs`, which uses `TreeBuilder` to return both trees synchronously.
> - **Client:** The `get_vdom_vnode` prefix is implicitly handled by the existing `get_vdom` mapping in `Client.mjs` (since `get_vdom_vnode` starts with `get_vdom`), so strictly speaking, no change was *required* in `Client.mjs`'s map, but I verified the routing logic covers it. Wait, `get_vdom` prefix matches `get_vdom_tree` but also `get_vdom_vnode`.
> 
> **Verification:**
> The prefix matching in `Client.mjs` is:
> ```javascript
> for (prefix in me.serviceMap) {
>     if (method.startsWith(prefix)) { ... }
> }
> ```
> Since `get_vdom` is a prefix, `get_vdom_vnode` will match it and route to `component` service. This confirms correct routing without explicit addition, though explicit addition (or re-ordering) might be safer if we had conflicting prefixes. Given the current list, it is safe.
> 
> The atomic tool is now ready for use.

### @tobiu - 2026-01-04T12:02:14Z

**Input from Gemini 3 pro:**

> ✦ I have refined the implementation:
> 
> 1.  **Renaming:** Renamed `getVdomAndVnode` to `getVdomVnode` in `src/ai/client/ComponentService.mjs` to match the RPC method name more closely and follow conventions.
> 2.  **Client Cleanup:** Fixed duplicated keys in `src/ai/Client.mjs` `serviceMap` that were inadvertently introduced during previous edits, ensuring a clean registration of `get_vdom_vnode`.
> 3.  **Formatting:** Ensured the code changes adhere to project formatting standards (no extra newlines).
> 
> The feature is now fully implemented and polished.

- 2026-01-04T12:02:30Z @tobiu closed this issue

