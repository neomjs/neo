---
id: 8307
title: 'Neural Link: Support depth in getVdomTree and getVnodeTree'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-04T11:15:31Z'
updatedAt: '2026-01-04T11:40:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8307'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T11:40:12Z'
---
# Neural Link: Support depth in getVdomTree and getVnodeTree

We need to update `getVdomTree` and `getVnodeTree` in `src/ai/client/ComponentService.mjs` to support a configured `depth`.

Currently, these methods return the raw `vdom` or `vnode` property of the component, which does not expand child component references or respect a depth limit.

We will leverage `src/util/vdom/TreeBuilder.mjs` to generate the trees with the specified depth.

**Requirements:**
- Update `getVdomTree` to accept `depth` and use `TreeBuilder.getVdomTree`.
- Update `getVnodeTree` to accept `depth` and use `TreeBuilder.getVnodeTree`.
- Default `depth` should be -1 (infinite) if not specified, matching `TreeBuilder` defaults.

**Context:**
Real-world usage in `src/mixin/VdomLifecycle.mjs` demonstrates using `TreeBuilder` for scoped updates.


## Timeline

- 2026-01-04T11:15:32Z @tobiu added the `enhancement` label
- 2026-01-04T11:15:32Z @tobiu added the `ai` label
- 2026-01-04T11:16:02Z @tobiu assigned to @tobiu
- 2026-01-04T11:16:09Z @tobiu added parent issue #8169
- 2026-01-04T11:39:44Z @tobiu referenced in commit `77d016e` - "Neural Link: Support depth in getVdomTree and getVnodeTree #8307"
### @tobiu - 2026-01-04T11:39:47Z

**Input from Gemini 2.5 pro:**

> ✦ I have verified the server-side implementation and the API definition:
> 
> 1.  `ai/mcp/server/neural-link/openapi.yaml`: The `get_vdom_tree` and `get_vnode_tree` operations use `GetComponentTreeRequest` schema, which correctly defines the `depth` parameter (integer).
> 2.  `ai/mcp/server/neural-link/services/ComponentService.mjs`: The `getVdomTree` and `getVnodeTree` methods correctly forward the `depth` parameter to the `ConnectionService`.
> 3.  `ai/mcp/server/neural-link/services/toolService.mjs`: Correctly binds the methods.
> 
> The missing link was purely in the client-side `src/ai/client/ComponentService.mjs`, which ignored the passed `depth`. This has been rectified.
> 
> The full stack now supports `depth` for VDOM/VNode inspection.

- 2026-01-04T11:40:12Z @tobiu closed this issue

