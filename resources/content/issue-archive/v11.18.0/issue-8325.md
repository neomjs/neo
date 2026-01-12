---
id: 8325
title: '[Neural Link] Enhance Instance Tools with Batch Operations'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2026-01-04T19:32:14Z'
updatedAt: '2026-01-04T19:39:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8325'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T19:39:01Z'
---
# [Neural Link] Enhance Instance Tools with Batch Operations

Proposed by Gemini 3 Pro based on user feedback.

**Goal:**
Enhance the recently created `InstanceService` tools to support batch operations. This improves efficiency (fewer round-trips) and leverages Neo.mjs's native batch setter (`instance.set()`) for better performance and reactivity handling.

**Changes:**

1.  **`get_instance_properties` (Rename from `get_instance_property`):**
    -   **Input:** Accepts an array of property names: `properties: ['width', 'height', 'text']`.
    -   **Output:** Returns an object mapping names to values: `{ width: 100, height: 200, text: 'Hi' }`.

2.  **`set_instance_properties` (Rename from `set_instance_property`):**
    -   **Input:** Accepts a key-value object: `properties: { width: 100, height: 200 }`.
    -   **Implementation:** Internally calls `instance.set(properties)`. This ensures proper lifecycle hook execution (`beforeSet`, `afterSet`) and atomic updates.

**Tasks:**
-   Update `src/ai/client/InstanceService.mjs`.
-   Update `ai/mcp/server/neural-link/services/InstanceService.mjs`.
-   Update `ai/mcp/server/neural-link/services/toolService.mjs` (renaming).
-   Update `ai/mcp/server/neural-link/openapi.yaml` (schemas and names).
-   Update `src/ai/Client.mjs` (service map).

## Timeline

- 2026-01-04T19:32:15Z @tobiu added the `enhancement` label
- 2026-01-04T19:32:16Z @tobiu added the `developer-experience` label
- 2026-01-04T19:32:16Z @tobiu added the `ai` label
- 2026-01-04T19:32:31Z @tobiu added parent issue #8169
- 2026-01-04T19:32:57Z @tobiu assigned to @tobiu
- 2026-01-04T19:37:32Z @tobiu referenced in commit `224fcc7` - "Enhance: Instance Tools Batch Operations (#8325)"
### @tobiu - 2026-01-04T19:37:48Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the batch operation enhancements for the `InstanceService` tools.
> 
> **Changes:**
> 1.  **Renamed & Enhanced Tools:**
>     -   `get_instance_property` -> `get_instance_properties`: Now accepts `properties` (array of strings) and returns an object mapping names to values.
>     -   `set_instance_property` -> `set_instance_properties`: Now accepts `properties` (object of key-value pairs) and uses `instance.set()` for atomic updates.
> 2.  **Code Updates:**
>     -   Updated `src/ai/client/InstanceService.mjs` to implement the batch logic.
>     -   Updated `ai/mcp/server/neural-link/services/InstanceService.mjs` to pass the new parameters.
>     -   Updated `ai/mcp/server/neural-link/services/toolService.mjs` to reflect the name changes.
>     -   Updated `src/ai/Client.mjs` service map.
>     -   Updated `ai/mcp/server/neural-link/openapi.yaml` with new schemas and endpoint definitions.
> 
> **Commit:** `224fcc797`
> 
> **Next Steps:**
> -   Restart the Neural Link server to apply the changes.
> -   Verify `get_instance_properties` with multiple properties (e.g., `['width', 'height']`).
> -   Verify `set_instance_properties` with multiple properties (e.g., `{width: 100, height: 200}`).

- 2026-01-04T19:39:01Z @tobiu closed this issue

