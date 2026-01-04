---
id: 8307
title: 'Neural Link: Support depth in getVdomTree and getVnodeTree'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-04T11:15:31Z'
updatedAt: '2026-01-04T11:16:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8307'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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


## Activity Log

- 2026-01-04 @tobiu added the `enhancement` label
- 2026-01-04 @tobiu added the `ai` label
- 2026-01-04 @tobiu assigned to @tobiu
- 2026-01-04 @tobiu added parent issue #8169

