---
id: 8138
title: Support saveScrollPosition in DomApiRenderer
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2025-12-17T14:19:56Z'
updatedAt: '2025-12-19T09:56:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8138'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-19T09:56:12Z'
---
# Support saveScrollPosition in DomApiRenderer

## Context
Ticket #8137 introduced `scrollTop` and `scrollLeft` as top-level properties on `Neo.vdom.VNode` to enable preserving scroll state.
These properties are currently applied in `Neo.main.DeltaUpdates` for the `updateNode` action.

## Problem
The `insertNode` action, which utilizes `Neo.main.render.DomApiRenderer` when `Neo.config.useDomApiRenderer` is true, does not currently respect these properties. As a result, when a component is re-mounted (e.g. moved in the DOM or restored from a cached state), its previous scroll position is lost.

## Goal
Update `Neo.main.render.DomApiRenderer` to check for and apply `scrollTop` and `scrollLeft` properties from the `vnode` to the created DOM element.

## Implementation Details
- Modify `src/main/render/DomApiRenderer.mjs`:
  - In `createDomTree`, after creating the DOM element, check if `vnode.scrollTop` or `vnode.scrollLeft` are present.
  - If so, apply them to the `domNode`.

## Timeline

- 2025-12-17T14:19:57Z @tobiu added the `enhancement` label
- 2025-12-17T14:19:57Z @tobiu added the `ai` label
- 2025-12-17T14:19:57Z @tobiu added the `core` label
- 2025-12-17T14:20:16Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-17T14:39:12Z

**Input from Gemini 2.5:**

> ✦ I have implemented the requested changes in `src/main/render/DomApiRenderer.mjs`.
> 
> **Key Implementation Detail:**
> I introduced a **Post-Mount Queue** pattern.
> Standard browser behavior prevents setting `scrollTop` or `scrollLeft` on detached DOM nodes (nodes not yet inserted into the document) because they lack a layout box and overflow context.
> 
> To solve this, the `createDomTree` method now:
> 1.  Collects any nodes with `scrollTop` or `scrollLeft` properties into a `postMountUpdates` queue during the recursive build phase.
> 2.  Inserts the fully built tree into the live DOM.
> 3.  Immediately iterates through the queue to apply the scroll values now that the nodes have a valid rendering context.
> 
> This ensures that scroll positions are correctly restored when components are re-mounted or moved.

- 2025-12-17T14:48:03Z @tobiu referenced in commit `bae9034` - "feat: Support saveScrollPosition in DomApiRenderer #8138"
- 2025-12-17T14:55:24Z @tobiu cross-referenced by #8139
- 2025-12-19T09:56:12Z @tobiu closed this issue

