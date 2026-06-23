---
id: 6129
title: 'manager.Focus: tree walking'
state: OPEN
labels:
  - enhancement
  - no auto close
  - architecture
  - core
assignees: []
createdAt: '2024-11-22T13:01:09Z'
updatedAt: '2026-06-23T05:53:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6129'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# manager.Focus: tree walking

I think we can do better here:

Right now, we parse the DOM paths and map them to related neo components. While this does work fine for nested widgets inside the DOM tree, it does not honor overlays as good as it should.

We should only fetch the closest component inside the `focusin` & `focusout` path and from there use the component tree.
1. find the closest common ancestor
2. walk the out path component tree upwards and fire `focusLeave`
3. walk the in path component tree upwards and fire `focusEnter`
4. fire `focusMove` on the common ancestor

It relies on `floating` components to be placed inside the component tree correctly.

@rwaters 

## Timeline

- 2024-11-22T13:01:09Z @tobiu added the `enhancement` label
### @github-actions - 2025-02-21T02:32:35Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-02-21T02:32:35Z @github-actions added the `stale` label
### @github-actions - 2025-03-07T02:38:08Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2025-03-07T02:38:08Z @github-actions closed this issue
- 2025-04-05T15:31:39Z @tobiu reopened this issue
- 2025-04-05T15:31:53Z @tobiu removed the `stale` label
- 2025-04-05T15:31:53Z @tobiu added the `no auto close` label
- 2026-06-23T05:53:51Z @neo-gpt added the `core` label
- 2026-06-23T05:53:51Z @neo-gpt added the `architecture` label
### @neo-gpt - 2026-06-23T05:53:53Z

## Triage update

V-B-A:
- Live issue check: the only prior comments are stale automation; the ticket is open again and still only carried `enhancement` + `no auto close`.
- Current code check: `src/manager/DomEvent.mjs` still passes the DOM listener `path` into `Neo.manager.Focus` for `focusin` / `focusout`.
- Current `src/manager/Focus.mjs` still diffs/intersects those DOM-derived component id paths in `focusMove()` and maps each id back through `Neo.getComponent()`, rather than deriving the closest component and walking the ownership/component tree.
- Supporting substrate check: `component.Base#getParents()` and existing LCA usage in `container.Base#insert()` show the component-tree primitives already exist; the missing piece is Focus manager semantics/order, not a new framework layer.

Decision: stage retrospective passed. This remains a valid framework-core architecture enhancement, especially for overlay/floating-component focus semantics where DOM ancestry and component ownership can diverge.

Applied labels: `core`, `architecture`.

Implementation shape:
- derive the nearest component from the incoming DOM focus path,
- derive old/new component ancestry through the component tree,
- find the closest common ancestor,
- fire `focusLeave` upward on the old side, `focusEnter` upward on the new side, and `focusMove` on the common ancestor,
- keep the existing timing behavior around `maxFocusInOutGap` intact unless a focused regression proves it is part of the bug.

Validation should include a focused unit/component test for a floating or overlay-owned child where the DOM path alone would miss the intended ownership transition.

Assignment: leaving unassigned and not applying `ai`; this is routed, not claimed.

Triaged per `ticket-triage` skill. Applied: `core`, `architecture`. Stage retrospective passed.


