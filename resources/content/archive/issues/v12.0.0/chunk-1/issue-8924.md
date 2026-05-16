---
id: 8924
title: 'Feat: Support nested property paths in get_instance_properties'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-31T15:20:36Z'
updatedAt: '2026-01-31T16:37:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8924'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-31T16:37:04Z'
---
# Feat: Support nested property paths in get_instance_properties

Enhance `get_instance_properties` to support dot-notation for accessing nested properties on an instance.

**Current Behavior:**
`properties: ['store']` returns the Store ID (if instance) or object.
To get the count, a second call is needed: `inspect_store` or `get_instance_properties` on the store ID.

**New Behavior:**
Support `properties: ['store.count', 'layout.align', 'view.style.color']`.

**Implementation:**
Update `Neo.ai.client.InstanceService` to traverse the object graph using a `Neo.ns`-like helper for each requested property path.

**Benefit:**
Enables agents to retrieve deep state (e.g. "Why is the grid empty?" -> check `store.filters`) in a single roundtrip without needing `eval`.

## Timeline

- 2026-01-31T15:20:37Z @tobiu added the `enhancement` label
- 2026-01-31T15:20:37Z @tobiu added the `ai` label
- 2026-01-31T16:29:48Z @tobiu assigned to @tobiu
- 2026-01-31T16:36:37Z @tobiu referenced in commit `858c8d6` - "feat: Support nested property paths in get_instance_properties (#8924)

Enhanced InstanceService methods (findInstances, getInstanceProperties) to use Neo.ns() for property retrieval, enabling nested dot-notation access (e.g., 'store.count'). Updated openapi.yaml to reflect this capability."
### @tobiu - 2026-01-31T16:36:50Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the support for nested property paths.
> 
> **Changes:**
> 1.  **Core Logic:** Updated `src/ai/client/InstanceService.mjs` to use `Neo.ns(property, false, instance)` instead of direct access `instance[property]`. This applies to both `getInstanceProperties` and `findInstances`.
> 2.  **Documentation:** Updated `ai/mcp/server/neural-link/openapi.yaml` to explicitly state that `properties` and `returnProperties` now support dot-notation (e.g., `store.count`).
> 
> This allows agents to drill down into objects in a single call.

- 2026-01-31T16:37:04Z @tobiu closed this issue

