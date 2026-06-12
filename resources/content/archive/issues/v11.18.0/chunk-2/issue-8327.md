---
id: 8327
title: '[Neural Link] Feature: Tool find_instances'
state: CLOSED
labels:
  - developer-experience
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-01-04T19:47:47Z'
updatedAt: '2026-01-05T11:06:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8327'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T11:06:34Z'
---
# [Neural Link] Feature: Tool find_instances


**Goal:**
Enable discovery of any Neo instance (StateProviders, Stores, Managers, etc.) by property matching using the global Instance Manager.

**Specification:**

1.  **Tool Name:** `find_instances`
2.  **Service:** `src/ai/client/InstanceService.mjs`
3.  **Logic:**
    *   Use `Neo.manager.Instance.find(selector)` to retrieve matches.
    *   This leverages the existing `Neo.collection.Base` finding logic (exact match on properties).
4.  **Parameters:**
    *   `selector` (Required, Object): Key-value pairs to match (e.g., `{ className: 'Neo.state.Provider' }`).
    *   `returnProperties` (Optional, Array<String>): List of specific properties to extract.
5.  **Return Format:**
    *   **Default:** Returns `instance.toJSON()` for each match.
    *   **With `returnProperties`:** Returns a lean summary object:
        ```json
        {
          "instances": [
            {
              "id": "neo-provider-1",
              "className": "Neo.state.Provider",
              "properties": {
                "someProp": "someValue"
              }
            }
          ]
        }
        ```
6.  **Implementation Details:**
    *   Reuse `this.safeSerialize()` from the base `Service` class for property values.
    *   Unlike `query_component`, this tool is **flat** (global search) and does not support `rootId` or hierarchical `down()` lookups.

**Comparison with `query_component`:**
*   `query_component`: Focused on UI hierarchy, supports `rootId`, traverses `down()`, returns `components`.
*   `find_instances`: Focused on abstract architecture (Stores, Providers), global scope, returns `instances`.


## Timeline

- 2026-01-04T19:47:48Z @tobiu added the `developer-experience` label
- 2026-01-04T19:47:48Z @tobiu added the `ai` label
- 2026-01-04T19:47:49Z @tobiu added the `feature` label
- 2026-01-04T19:48:07Z @tobiu added parent issue #8169
- 2026-01-04T20:09:32Z @tobiu cross-referenced by #8326
- 2026-01-05T10:53:01Z @tobiu assigned to @tobiu
- 2026-01-05T11:05:54Z @tobiu referenced in commit `2d91c80` - "[Neural Link] Feature: Tool find_instances #8327"
### @tobiu - 2026-01-05T11:06:06Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the `find_instances` tool.
> 
> **Changes:**
> 1.  **`src/ai/client/InstanceService.mjs`**: Added `findInstances` method.
>     - Optimized logic to leverage `Neo.collection.Base.find` directly.
>     - Simplified parameter validation and variable usage.
> 2.  **`ai/mcp/server/neural-link/services/toolService.mjs`**: Registered the tool mapping.
> 3.  **`ai/mcp/server/neural-link/openapi.yaml`**: Defined the API endpoint and schema.
> 
> The tool uses `Neo.manager.Instance.find()` for global instance discovery and supports the `returnProperties` parameter for lean responses.

- 2026-01-05T11:06:35Z @tobiu closed this issue

