---
id: 8822
title: 'doc: VDOM Engine Architectural Changes'
state: CLOSED
labels:
  - documentation
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T03:25:19Z'
updatedAt: '2026-01-20T03:31:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8822'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T03:30:34Z'
---
# doc: VDOM Engine Architectural Changes

Documenting the recent architectural changes to the VDOM engine that resolve race conditions.

Files to update with JSDoc:
- `src/manager/VDomUpdate.mjs`: `descendantInFlightMap`, `hasInFlightDescendants`, `registerInFlightUpdate`
- `src/mixin/VdomLifecycle.mjs`: `isChildUpdating`
- `src/util/vdom/TreeBuilder.mjs`: Expansion logic for unmounted nodes
- `src/vdom/Helper.mjs`: neoIgnore skip logic for insertNode

This ticket ensures the knowledge base reflects the current state of the engine.

## Timeline

- 2026-01-20T03:25:20Z @tobiu added the `documentation` label
- 2026-01-20T03:25:20Z @tobiu added the `ai` label
- 2026-01-20T03:25:20Z @tobiu added the `core` label
- 2026-01-20T03:30:34Z @tobiu closed this issue
- 2026-01-20T03:31:23Z @tobiu assigned to @tobiu

