---
id: 8324
title: '[Neural Link] Generalize Property Access to InstanceService'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-04T19:20:33Z'
updatedAt: '2026-01-04T19:29:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8324'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T19:29:34Z'
---
# [Neural Link] Generalize Property Access to InstanceService

Proposed by Gemini 3 Pro.

**Goal:**
Generalize the `get_component_property` and `set_component_property` tools to work with any `Neo.core.Base` instance (Stores, Controllers, Managers), not just Components.

**Tasks:**
1.  Create `src/ai/client/InstanceService.mjs`.
2.  Implement `getInstanceProperty` and `setInstanceProperty` using `Neo.get()` instead of `Neo.getComponent()`.
3.  Update `src/ai/Client.mjs` to include the new service.
4.  Update `ai/mcp/server/neural-link/services/toolService.mjs` mappings.
5.  Update `ai/mcp/server/neural-link/openapi.yaml` to rename tools and update schema.
6.  Remove the old `get_component_property` and `set_component_property` implementations from `ComponentService.mjs`.

**Rationale:**
AI agents need to inspect non-visual instances (like data stores or state controllers) to fully understand and manipulate the application state. Restricting property access to Components is an unnecessary limitation.

## Timeline

- 2026-01-04T19:20:34Z @tobiu added the `enhancement` label
- 2026-01-04T19:20:34Z @tobiu added the `ai` label
- 2026-01-04T19:20:35Z @tobiu added the `refactoring` label
- 2026-01-04T19:20:40Z @tobiu added parent issue #8169
- 2026-01-04T19:20:49Z @tobiu assigned to @tobiu
- 2026-01-04T19:28:53Z @tobiu referenced in commit `55ffe15` - "Refactor: Generalize Property Access to InstanceService (#8324)"
### @tobiu - 2026-01-04T19:29:09Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully refactored the property access tools to be generic and support any Neo instance.
> 
> **Changes Implemented:**
> 1.  **New Service:** Created `src/ai/client/InstanceService.mjs` and `ai/mcp/server/neural-link/services/InstanceService.mjs`.
> 2.  **Renamed Tools:**
>     -   `get_component_property` -> `get_instance_property`
>     -   `set_component_property` -> `set_instance_property`
> 3.  **Expanded Scope:** The tools now use `Neo.get(id)` instead of `Neo.getComponent(id)`, allowing access to Stores, Controllers, Managers, and any other `Neo.core.Base` instance.
> 4.  **Cleanup:** Removed the old component-specific implementations from `ComponentService`.
> 5.  **API Update:** Updated `openapi.yaml` to reflect the new tool names, descriptions, and schema references (e.g., `GetInstancePropertyRequest`).
> 
> **Commit:** `55ffe15d0`
> 
> **Next Steps:**
> -   Restart the Neural Link server to apply the changes.
> -   Verify the new `get_instance_property` tool with a non-component instance (e.g., a Store).

- 2026-01-04T19:29:35Z @tobiu closed this issue

