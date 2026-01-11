---
id: 8465
title: Investigate VDOM ID Collisions and Create Reproduction Test
state: CLOSED
labels:
  - bug
  - ai
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T13:31:59Z'
updatedAt: '2026-01-09T13:50:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8465'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T13:50:10Z'
---
# Investigate VDOM ID Collisions and Create Reproduction Test

Investigate the root cause of issue #8464 where components appeared to share VDOM IDs or cross-contaminate.

Suspicions:
1. Prototype sharing of `_vdom` objects leading to shared IDs.
2. Race condition in `VDomUpdate` manager.

Goal: Create a unit test `test/playwright/unit/vdom/AutoId.spec.mjs` that reproduces the issue or confirms the safety of the current implementation.


## Timeline

- 2026-01-09T13:32:00Z @tobiu added the `bug` label
- 2026-01-09T13:32:00Z @tobiu added the `ai` label
- 2026-01-09T13:32:01Z @tobiu added the `testing` label
- 2026-01-09T13:32:01Z @tobiu added the `core` label
- 2026-01-09T13:49:00Z @tobiu referenced in commit `98552e9` - "fix: architectural resolution for VDOM ID collisions (#8465)"
- 2026-01-09T13:49:07Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T13:49:19Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented an architectural resolution for VDOM ID collisions, which were the root cause of the "Zombie Update" artifacts observed in the Portal app.
> 
> ### **Investigation Summary**
> The issue was traced to `ComponentManager.wrapperNodes`. This Map uses VDOM node IDs as keys to map back to component instances for components that use a wrapper node (e.g. `Portal.view.news.blog.List`). 
> When multiple components with wrapper nodes were created, their auto-generated VDOM IDs (e.g. `neo-vnode-1`) would collide in the global Map, causing the framework to incorrectly resolve component references during tree flattening.
> 
> ### **Resolution**
> Instead of relying on auto-generated IDs for wrapper nodes, the framework now automatically assigns a stable, unique ID derived from the component instance ID:
> - **`VdomLifecycle`**: Automatically assigns `me.id + '__wrapper'` to the root VDOM node if it is a wrapper node.
> - **`Component.Base`**: Synchronizes this stable ID in `afterSetId` to maintain consistency if the component ID changes.
> 
> ### **Verification**
> - Added a new unit test: `test/playwright/unit/vdom/AutoId.spec.mjs`. This test successfully reproduces the collision bug by forcing `IdGenerator` resets and verifies that the fix prevents the collision.
> - Reverted the manual `onConstructed` ID fixes in the Portal app, as they are no longer required.
> 
> The system is now robust against auto-generated VDOM ID collisions for wrapped components.
> 
> Commit: 98552e98e (#8465)

- 2026-01-09T13:50:11Z @tobiu closed this issue
- 2026-01-09T13:50:30Z @tobiu cross-referenced by #8464
- 2026-01-09T14:02:56Z @tobiu cross-referenced by #8468

