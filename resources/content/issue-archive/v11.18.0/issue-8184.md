---
id: 8184
title: 'Feat: Neural Link - Navigation Control & History'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T20:58:50Z'
updatedAt: '2025-12-29T21:31:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8184'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T21:31:16Z'
---
# Feat: Neural Link - Navigation Control & History

**Context:**
Navigation is the primary way to change application state. Agents need to read the current route, understand the navigation history, and drive the application to specific views.

**Scope:**

1.  **Enhance `RuntimeService`:**
    -   Add `getRouteHistory(sessionId)`: Retrieves history from `Neo.util.HashHistory` (singleton in App Worker).
    -   Add `setRoute(sessionId, hash)`: Calls `Neo.Main.setRoute({hash, windowId})` (Remote method).

2.  **Tools:**
    -   `get_route_history`: Returns the history stack and current index.
    -   `set_route`: Accepts `hash` and optional `windowId` (defaults to sessionId's main window).

**Goal:** Enable agents to navigate and understand the navigation context.

## Timeline

- 2025-12-28T20:58:51Z @tobiu added the `enhancement` label
- 2025-12-28T20:58:51Z @tobiu added the `ai` label
- 2025-12-28T20:59:01Z @tobiu added parent issue #8169
- 2025-12-29T20:50:43Z @tobiu assigned to @tobiu
- 2025-12-29T20:57:12Z @tobiu referenced in commit `d6ada46` - "feat(ai): Implement Navigation Control & History (#8184)

- Add getRouteHistory and setRoute to RuntimeService (client & server)
- Expose get_route_history and set_route via MCP
- Update OpenAPI spec
- Add tool mappings"
### @tobiu - 2025-12-29T20:57:17Z

**Input from Gemini 3.0:**

> ✦ I have implemented the Navigation Control & History features as requested.
> 
> **Changes:**
> 1.  **Client-Side (`src/ai/client/RuntimeService.mjs`):**
>     -   Implemented `getRouteHistory` utilizing `Neo.util.HashHistory`.
>     -   Implemented `setRoute` wrapping `Neo.Main.setRoute`.
>     -   Updated `src/ai/Client.mjs` to map `get_route` (history) and `set_route` RPC calls.
> 
> 2.  **Server-Side (`ai/mcp/server/neural-link/`):**
>     -   Updated `RuntimeService.mjs` to expose `getRouteHistory` and `setRoute` methods.
>     -   Updated `toolService.mjs` to register the new tools.
>     -   Updated `openapi.yaml` with definitions for `/navigation/history` and `/navigation/route/set`.
> 
> The Neural Link now supports reading the navigation stack and driving the application route programmatically.

- 2025-12-29T21:31:16Z @tobiu closed this issue

