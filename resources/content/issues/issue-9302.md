---
id: 9302
title: 'Enhancement: Add `canvasReady` event to `Neo.app.SharedCanvas`'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-25T17:26:55Z'
updatedAt: '2026-02-25T17:28:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9302'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-25T17:28:15Z'
---
# Enhancement: Add `canvasReady` event to `Neo.app.SharedCanvas`

When using `Neo.app.SharedCanvas`, parent components often need to wait until the remote canvas worker connection is fully established before sending configuration commands (like `renderer.updateConfig()`).

This enhancement adds a `canvasReady` event to `Neo.app.SharedCanvas`, fired from within `afterSetIsCanvasReady`. 

Additionally, the base `Neo.app.header.Toolbar` now subscribes to this event and provides an empty `onCanvasReady()` template method, allowing subclasses to easily and safely initialize their canvas states without race conditions.

## Timeline

- 2026-02-25T17:26:56Z @tobiu added the `enhancement` label
- 2026-02-25T17:26:56Z @tobiu added the `ai` label
- 2026-02-25T17:27:45Z @tobiu referenced in commit `54fde26` - "feat(app): Add `canvasReady` event to `SharedCanvas` (#9302)"
### @tobiu - 2026-02-25T17:27:54Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the `canvasReady` event in `SharedCanvas` and subscribed to it in the base `Toolbar` with an empty `onCanvasReady()` template method. This will allow the `DevIndex.view.HeaderToolbar` to securely wait for the remote worker connection before applying local storage configuration values.
> 
> I have pushed the changes and consider this enhancement complete.

- 2026-02-25T17:28:02Z @tobiu assigned to @tobiu
- 2026-02-25T17:28:15Z @tobiu closed this issue

