---
id: 8051
title: '[DomEvent] Support Logical Ancestry in verifyDelegationPath'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-07T18:14:08Z'
updatedAt: '2025-12-07T18:18:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8051'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-07T18:18:00Z'
---
# [DomEvent] Support Logical Ancestry in verifyDelegationPath

Update `Neo.manager.DomEvent.verifyDelegationPath` to support "Logical Component Bubbling".

**Context:**
We recently updated `ComponentManager.getParentPath` to support logical event bubbling (traversing `component.parent` when the DOM hierarchy is disconnected, e.g., Portals/Proxies). This allows `DomEvent.fire` to find listeners on logical ancestors (like a Dashboard) even if the event target (in a DragProxy) is physically detached.

**The Problem:**
Even though `DomEvent.fire` now finds the correct listener on the logical ancestor, the `verifyDelegationPath` check fails. This check validates that the delegation target (the element matching the `delegate` selector) is a *descendant* of the listener's component. Currently, it only checks the raw DOM path. Since the listener component (Dashboard) is not in the raw DOM path of the detached target (Proxy), the check returns `false`.

**The Fix:**
Update `verifyDelegationPath` to perform a "Logical Ancestry Check" if the standard DOM check fails.
1.  Pass the calculated logical `componentPath` to `verifyDelegationPath`.
2.  If the DOM ancestry check fails:
    *   Iterate up the DOM path starting from the delegation target.
    *   Find the first component ID that exists in the logical `componentPath`.
    *   Verify that this component is logically "below" (or same as) the listener component in the `componentPath`.

**Impact:**
This ensures that event delegation (e.g., `delegate: '.neo-draggable'`) works correctly for components that rely on logical bubbling, such as DragProxies, Modal Dialogs, and Multi-Window components.

## Timeline

- 2025-12-07T18:14:09Z @tobiu added the `enhancement` label
- 2025-12-07T18:14:09Z @tobiu added the `ai` label
- 2025-12-07T18:14:10Z @tobiu added the `architecture` label
- 2025-12-07T18:14:41Z @tobiu assigned to @tobiu
- 2025-12-07T18:16:20Z @tobiu referenced in commit `eab5cac` - "[DomEvent] Support Logical Ancestry in verifyDelegationPath #8051"
- 2025-12-07T18:17:30Z @tobiu closed this issue
- 2025-12-07T18:17:54Z @tobiu reopened this issue
- 2025-12-07T18:18:00Z @github-actions closed this issue
### @github-actions - 2025-12-07T18:18:01Z

❌ Tickets cannot be reopened. Created new ticket: #8052


