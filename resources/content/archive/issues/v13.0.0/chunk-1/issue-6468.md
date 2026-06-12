---
id: 6468
title: 'component.Base: vdom => add a scroll attribute'
state: CLOSED
labels:
  - enhancement
  - no auto close
assignees: []
createdAt: '2025-02-19T11:25:26Z'
updatedAt: '2026-06-03T01:30:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6468'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-06-03T01:30:03Z'
---
# component.Base: vdom => add a scroll attribute

While it is not possible to set the scroll position on DOM level, this would not be a problem for neo: a delta would contain a changed scrollLeft or scrollTop value, and could easily programmatically adjust the scroll state once the node is painted or updated.

E.g.:
```
{tag: 'div', scroll: {top: '100px'}}
```

* For getting deltas including scroll changes, `Neo.vdom.Vnode` also needs to get the new scroll attribute.
* It is important for this scenario, that user based scroll changes also update the related `vdom` & `vnode` attributes for the matching component, otherwise we could get deltas when there is no need for a change.

Rationale where I would use it:

https://github.com/user-attachments/assets/9a640ef7-ff2c-4b47-bc27-ee82665bbd9a

I know it is minor, but if you look close, you can see that the scrolling (sometimes painting new rows outside the buffer range on the fly) and the selection change do not always happen inside the same animation frame.

The view triggers an update, passing vdom&vnode to the vdom worker, it figures out the deltas and applies them inside main (cycling rows). in parallel the app worker directly sends a request to main to adjust the scroll position.

## Timeline

- 2025-02-19T11:25:26Z @tobiu added the `enhancement` label
### @github-actions - 2025-05-21T02:53:25Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-05-21T02:53:26Z @github-actions added the `stale` label
### @github-actions - 2025-06-04T02:56:59Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2025-06-04T02:56:59Z @github-actions closed this issue
- 2025-06-04T10:24:39Z @tobiu removed the `stale` label
- 2025-06-04T10:24:39Z @tobiu added the `no auto close` label
- 2025-06-04T10:24:42Z @tobiu reopened this issue
### @neo-gpt - 2026-06-03T01:29:58Z

**Input from GPT-5 Codex (Codex Desktop):**

> ● ## Closeout V-B-A — implemented by later scroll-state work
> 
> I rechecked this ticket against current `dev` before closing it.
> 
> Evidence:
> 
> - `src/vdom/VNode.mjs` now carries `scrollLeft` and `scrollTop` through VNode construction.
> - `src/main/DeltaUpdates.mjs`, `src/main/render/DomApiRenderer.mjs`, and `src/vdom/util/StringFromVnode.mjs` apply scroll state after inserted nodes mount, covering both renderer paths.
> - `src/component/Base.mjs` now captures scroll events from the main thread and syncs the matching logical vdom node's `scrollTop` / `scrollLeft`, covering the ticket's concern that user-driven scroll changes must update the related vdom/vnode state.
> - Git history points at the later save-scroll-position work as the delivery line: `#8137`, `#8138`, and `#8139`.
> - Dedicated unit coverage exists in `test/playwright/unit/functional/ScrollState.spec.mjs` for preserving `scrollTop`, preserving `scrollLeft`, syncing root-node scroll state, and syncing child-node scroll state across VDOM updates.
> 
> Validation run:
> 
> ```bash
> npm run test-unit -- test/playwright/unit/functional/ScrollState.spec.mjs
> ```
> 
> Result: 4 passed.
> 
> Disposition: closing this reopened stale ticket as completed; the requested VDOM/VNode scroll-state behavior is now present and tested.

- 2026-06-03T01:30:03Z @neo-gpt closed this issue

