---
id: 8873
title: 'Refactor: Standardize VNodeUtil and VDomUtil getChildIds to include components'
state: OPEN
labels:
  - stale
  - ai
  - refactoring
  - core
assignees: []
createdAt: '2026-01-23T23:23:16Z'
updatedAt: '2026-04-24T04:31:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8873'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: Standardize VNodeUtil and VDomUtil getChildIds to include components

**Description:**
Currently, `VNodeUtil.getChildIds(vnode)` implicitly filters out component placeholders (nodes with `componentId`). `VDomUtil.getChildIds(vdom)` likely shares similar logic or intent. This behavior is unintuitive and forced complex workarounds in `VdomLifecycle.syncVnodeTree`.

**Goal:**
Make `getChildIds` consistent across both `VNodeUtil` and `VDomUtil`, ensuring they can return all children including components.

**Proposed Change:**
1.  Update `VNodeUtil.getChildIds` AND `VDomUtil.getChildIds` to accept an options object, e.g., `{includeComponents: true}`.
2.  Ensure both utilities behave symmetrically regarding component placeholders/references.
3.  Refactor `VdomLifecycle.syncVnodeTree` to use this new option.

**Benefits:**
*   Consistency between VDOM and VNode utilities.
*   Cleaner code in `VdomLifecycle`.
*   Less "magic" filtering.

## Timeline

- 2026-01-23T23:23:17Z @tobiu added the `ai` label
- 2026-01-23T23:23:17Z @tobiu added the `refactoring` label
- 2026-01-23T23:23:17Z @tobiu added the `core` label
### @github-actions - 2026-04-24T04:31:32Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-04-24T04:31:33Z @github-actions added the `stale` label

