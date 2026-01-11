---
id: 8187
title: 'Feat: Neural Link - State Provider Inspection & Modification'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T21:12:24Z'
updatedAt: '2025-12-29T21:29:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8187'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T21:29:52Z'
---
# Feat: Neural Link - State Provider Inspection & Modification

**Context:**
For modern Neo apps using `state.Provider`, inspecting the global state tree is the fastest way to understand the application context. Modifying this state is a powerful way to drive the application.

**Scope:**

1.  **Enhance `ComponentService`:**
    -   Update `getComponentTree` to include `stateProviderId` on components.

2.  **Enhance `DataService`:**
    -   Add `inspectStateProvider(sessionId, providerId)`.
        -   Implementation: `Neo.get(providerId).getHierarchyData()`.
    -   Add `modifyStateProvider(sessionId, providerId, data)`.
        -   Implementation: `Neo.get(providerId).setData(data)`.
        -   `data` is a JSON object with keys/values (can be nested).

3.  **Tools:**
    -   `inspect_state_provider`: Returns the effective state object.
    -   `modify_state_provider`: Updates the state.

**Goal:** Provide full read/write access to the application's reactive state hierarchy.

## Timeline

- 2025-12-28T21:12:25Z @tobiu added the `enhancement` label
- 2025-12-28T21:12:25Z @tobiu added the `ai` label
- 2025-12-28T21:12:34Z @tobiu added parent issue #8169
- 2025-12-29T21:22:35Z @tobiu assigned to @tobiu
- 2025-12-29T21:23:23Z @tobiu referenced in commit `dc0b535` - "feat(ai): Implement State Provider Inspection & Modification (#8187)

- ComponentService: Include stateProviderId in component tree (own provider only)
- DataService: Add inspectStateProvider and modifyStateProvider (client & server)
- Expose new tools via MCP and update OpenAPI spec"
### @tobiu - 2025-12-29T21:29:36Z

**Input from Gemini 3:**

> ✦ I have implemented the State Provider Inspection & Modification features.
> 
> **Changes:**
> 1.  **Component Service (`src/ai/client/ComponentService.mjs`):**
>     -   Updated `serializeComponent` to include `stateProviderId` in the output *only* if the component explicitly defines/owns a `stateProvider`. This provides a clear view of state scope boundaries within the component tree without noise.
> 
> 2.  **Data Service (`src/ai/client/DataService.mjs`, `ai/mcp/server/neural-link/services/DataService.mjs`):**
>     -   Implemented `inspectStateProvider(providerId)`: Returns the hierarchical data object from the provider.
>     -   Implemented `modifyStateProvider(providerId, data)`: Allows merging new data into the provider.
> 
> 3.  **MCP Integration:**
>     -   Registered `inspect_state_provider` and `modify_state_provider` tools.
>     -   Updated `src/ai/Client.mjs` service mappings.
>     -   Updated `openapi.yaml` with new paths and schemas.
> 
> Agents can now discover where state providers are located (via `get_component_tree`) and then inspect or modify their data directly.

- 2025-12-29T21:29:53Z @tobiu closed this issue

