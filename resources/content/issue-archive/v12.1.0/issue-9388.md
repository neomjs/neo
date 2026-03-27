---
id: 9388
title: 'E2E: Enhance VDOM Update Pipeline with Meta Payload Support'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-08T11:07:55Z'
updatedAt: '2026-03-08T11:20:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9388'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[x] 9387 E2E: Implement Main Thread Optical Pinning for Grid Scrolling'
closedAt: '2026-03-08T11:20:09Z'
---
# E2E: Enhance VDOM Update Pipeline with Meta Payload Support

To avoid expensive heuristic parsing of `translate3d` deltas on the main thread for the upcoming `GridOpticalPinning` addon, we need the ability to pass a deterministic `meta` object from a component's VDOM update (in the App Worker) through to the Main Thread.

**Implementation Steps:**
1. **`Neo.mixin.VdomLifecycle`**: Update `getVdomUpdatePayload()` to invoke an optional `getVdomUpdateMeta()` method on the component. If present, attach it to the `opts` payload.
2. **`Neo.vdom.Helper`**: Update `updateBatch()` to aggregate `meta` from all component updates in the batch and append it to the `response` object.
3. **`Neo.main.DeltaUpdates`**: Add the `Neo.core.Observable` mixin (`static observable = true`). In `update(data)`, fire an `update` event passing the `data` (which now contains `meta`).
4. **`Neo.grid.Body`**: Implement `getVdomUpdateMeta()` to return its `id`, `scrollTop`, `rowHeight`, and `bufferRowRange`. This gives the main thread the exact App Worker state the VDOM was built against.

## Timeline

- 2026-03-08T11:07:56Z @tobiu added the `enhancement` label
- 2026-03-08T11:07:56Z @tobiu added the `ai` label
- 2026-03-08T11:07:56Z @tobiu added the `architecture` label
- 2026-03-08T11:07:56Z @tobiu added the `grid` label
- 2026-03-08T11:08:46Z @tobiu added parent issue #9380
- 2026-03-08T11:08:56Z @tobiu marked this issue as blocking #9387
- 2026-03-08T11:19:26Z @tobiu referenced in commit `27efac6` - "Enhancement: Enhance VDOM Update Pipeline with Meta Payload Support (#9388)

- Added getVdomUpdateMeta to Neo.grid.Body to provide contextual state (scrollTop, rowHeight, etc.).
- Updated Neo.mixin.VdomLifecycle to attach the meta object to the VDOM update payload.
- Updated Neo.vdom.Helper.updateBatch to aggregate meta payloads and send them to the Main Thread.
- Added Neo.core.Observable mixin to Neo.main.DeltaUpdates and fire an update event before applying deltas.
- Added intent-driven JSDoc to document the new meta payload concept."
### @tobiu - 2026-03-08T11:19:35Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the `getVdomUpdateMeta` payload pipeline to allow App Worker components (like `GridBody`) to send deterministic state (e.g. `scrollTop`) alongside their VDOM deltas. 
> 
> `Neo.main.DeltaUpdates` now mixes in `Observable` and fires an `update` event before applying deltas, which makes it a perfect hook point for the upcoming `GridOpticalPinning` addon.
> 
> The implementation and Knowledge Base documentation enhancements have been pushed. Closing this issue.

- 2026-03-08T11:19:57Z @tobiu assigned to @tobiu
- 2026-03-08T11:20:10Z @tobiu closed this issue

