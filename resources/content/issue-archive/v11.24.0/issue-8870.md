---
id: 8870
title: Investigate VNode.getById(null) error in Container.onScrollCapture
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-23T20:00:16Z'
updatedAt: '2026-01-23T21:35:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8870'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-23T21:35:39Z'
---
# Investigate VNode.getById(null) error in Container.onScrollCapture

**Description:**
During a feasibility analysis for Card Layout optimization, a runtime error was observed in the Portal App when switching tabs quickly or triggering layout updates:

```text
VNode.mjs:132 Uncaught TypeError: Cannot read properties of null (reading 'id')
    at VNode.getById (VNode.mjs:132:27)
    at Container.onScrollCapture (Abstract.mjs:423:31)
    at Container.onScrollCapture (Base.mjs:1454:15)
```

**Context:**
The error occurs in `onScrollCapture`, which attempts to look up a VDOM node by ID using `VDomUtil.getById(me._vdom, data.target.id)`.
The error message "Cannot read properties of null (reading 'id')" inside `VNode.getById` suggests that `me._vdom` (passed as the root) might be valid, but traversal encounters a `null` node, or `me._vdom` itself is unexpectedly null/invalid in a way that `getById` doesn't handle gracefully.

**Hypothesis:**
This might be related to `removeDom` transitions where `_vdom` state on the component might be in flux or partially synced (e.g. `_vnode` vs `_vdom` mismatch, or `_vdom` containing null children due to template processing or other factors).

**Goal:**
Investigate the root cause of this error and harden `onScrollCapture` or `VDomUtil.getById` against null/invalid inputs.


## Timeline

- 2026-01-23T20:00:17Z @tobiu added the `bug` label
- 2026-01-23T20:00:17Z @tobiu added the `ai` label
- 2026-01-23T20:00:17Z @tobiu added the `core` label
### @tobiu - 2026-01-23T20:03:02Z

**Input from Gemini 3 Pro:**

> ✦ **Clarification:**
> This error was observed during an experimental branch where `_vnode` state was being actively modified/nullified during updates. It may not be currently reproducible on the `dev` branch.
> 
> However, the fact that `onScrollCapture` can crash if the VDOM state is slightly out of sync with the Event target suggests a vulnerability. The fix should focus on graceful handling (e.g., checking if `vdomNode` exists before accessing properties) rather than assuming deep structural corruption in the stable codebase. This is a hardening task.

- 2026-01-23T21:35:08Z @tobiu referenced in commit `4f62336` - "fix: Harden getById against null nodes (#8870)"
### @tobiu - 2026-01-23T21:35:18Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the hardening fix to both `src/util/VNode.mjs` and `src/util/VDom.mjs`.
> 
> Both `getById` methods now gracefully handle `null` nodes during traversal, returning `null` instead of throwing a `TypeError`. This ensures stability in scenarios where VDOM/VNode state might be transiently inconsistent or contain null placeholders (e.g., during unmounts or race conditions).
> 
> Changes committed and pushed to `feat/card-incremental-updates`. Closing ticket.

- 2026-01-23T21:35:21Z @tobiu assigned to @tobiu
- 2026-01-23T21:35:40Z @tobiu closed this issue

