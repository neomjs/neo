---
id: 9356
title: 'Chrome Windows: Multi Window Drag & Drop'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2026-03-06T09:10:21Z'
updatedAt: '2026-03-15T22:34:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9356'
author: kmunk-klarso
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-15T22:29:21Z'
---
# Chrome Windows: Multi Window Drag & Drop

- Open Docked Window 
-- auf weiterem fenster Position rechts und links macht keinen Unterschied
-- Create Dialog lässt sich nicht zwischen Fenster hin und herziehen, Dialog verschwindet dabei


## Timeline

- 2026-03-06T09:10:22Z @kmunk-klarso added the `bug` label
- 2026-03-15T22:28:15Z @tobiu referenced in commit `231a645` - "bugfix: Fix cross-window Drag&Drop component coordinates (#9356)

1. Removed a mutating side effect `Object.assign` inside `src/component/Base.mjs` -> `beforeGetWrapperStyle`. This mutation incorrectly bypassed normal component updates in specific merge scenarios.
2. Updated the SharedDialog `MainContainerController` to correctly apply new positional coordinates to `dialog.style` instead of `dialog.wrapperStyle` during a cross-window drag handoff, preventing previous window coordinates from overriding the drop coordinates.
3. Cleaned up `onDragStart` inside the SharedDialog `MainContainerController` to properly pass the `windowId` requirement for remote method routing to `Neo.Main.getWindowData()`."
### @tobiu - 2026-03-15T22:28:29Z

**Input from Gemini 3.1 Pro:**

> ✦ Hi @kmunk-klarso, thanks a lot for reporting this issue! It was an incredibly subtle bug involving a regression in the component styling system.
> 
> Here is an in-depth breakdown of what was happening and how we fixed it:
> 
> ### The Problem
> 
> 1.  **The Drop Calculation**: In the multi-window `SharedDialog` app, when a dialog was dropped into the other window, the `MainContainerController` calculated the new `left` and `top` coordinates and applied them to `dialog.wrapperStyle`.
> 2.  **The Merge Conflict**: The base `Component` handles styling via two reactive configs: `style_` and `wrapperStyle_`. When you modify either, it triggers `updateStyle()`, which merges them into the actual VDOM tree: `vdom.style = {...me.wrapperStyle, ...me.style}`.
> 3.  **The Regression**: Because `...me.style` comes *last* in the merge, the old coordinates from the previous window (which were stored in `me.style` by the `DragZone` upon drag completion) completely **overrode** the newly calculated coordinates in `me.wrapperStyle`. This caused the dialog to render at its old coordinates in the new window, effectively vanishing from view (likely off-screen).
> 
> ### The Puzzling Part: Why did it work in older Neo.mjs versions?
> 
> The reason this used to work fine in older versions of the framework comes down to a side effect that was present in the `wrapperStyle_` getter inside `src/component/Base.mjs`:
> 
> ```javascript
> // Old buggy version
> beforeGetWrapperStyle(value) {
>     return {...Object.assign(this.vdom.style || {}, value)}
> }
> ```
> 
> `Object.assign()` mutates its first argument in place! In older versions of Neo, this side effect accidentally masked the merge conflict. The timing of property accesses under the old config system meant `this.vdom.style` was mutated directly *before* the VDOM was mounted, effectively sneaking the correct coordinates into the tree. 
> 
> With the introduction of the new `core.Config` reactivity system, the timing of these getters and setters became stricter and more predictable. The side effect was no longer triggered at the exact moment needed to mask the bug. Interestingly, while diagnosing this, we temporarily added `console.log(dialog.wrapperStyle)` which artificially triggered the getter. This caused the mutation to fire right when it was needed, "fixing" the bug locally and ultimately guiding us to the root cause!
> 
> ### The Fix
> 
> 1.  **Fixed the Side Effect**: We removed the mutating `Object.assign` side effect from `src/component/Base.mjs` -> `beforeGetWrapperStyle`. It now safely returns a merged object without mutating the VDOM directly: `return {...this.vdom.style, ...value}`.
> 2.  **Fixed the Controller**: We updated the `SharedDialog` app's `MainContainerController` to correctly apply the new drop coordinates to `dialog.style` instead of `dialog.wrapperStyle`. Since `Dialog.mjs` uses `style` for its drag positioning, the controller must also use `style` when calculating new positions to prevent the old style from overriding the new coordinates.
> 3.  **Cleaned up Routing**: We also took the opportunity to clean up `onDragStart`, ensuring the `windowId` is correctly passed to the remote `Neo.Main.getWindowData()` call, adhering to the strict architectural constraints of our `RemoteMethodAccess` system.
> 
> The changes have been pushed to the `dev` branch. Thanks again for the report!

- 2026-03-15T22:29:08Z @tobiu assigned to @tobiu
- 2026-03-15T22:29:21Z @tobiu closed this issue

