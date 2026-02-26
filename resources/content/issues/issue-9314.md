---
id: 9314
title: 'SharedCanvas: Refactor ResizeObserver Architecture & Event Routing'
state: OPEN
labels:
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-02-26T19:31:24Z'
updatedAt: '2026-02-26T19:36:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9314'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# SharedCanvas: Refactor ResizeObserver Architecture & Event Routing

## Context
During work on the Header Canvas (#9313), we discovered a fundamental architectural flaw in how `Neo.app.SharedCanvas` handles `ResizeObserver` events. The symptom was that `onResize()` never fired when the browser window resized, breaking the synchronization between the DOM and the Shared Worker canvas renderer.

## The Flaw
1. `src/component/Canvas.mjs` uses `monitorSize_: true` to automatically add a `resize` DOM listener to `me.getCanvasId()`. When it resizes, it calls `onDomResize(data)`, which simply fires a Neo component event: `this.fire('resize', data)`.
2. `src/app/SharedCanvas.mjs` (which extends `component/Canvas`) maps this Neo component event via `listeners: { resize: 'onResize' }`.

**This is structurally flawed:** Listening to a component event that your own base class fires is an anti-pattern. Events are intended for communication between *unrelated* instances (e.g., a Viewport listening to a Button's click). 
A subclass should simply override the method (`onDomResize`) and call `super.onDomResize()`, rather than registering an event listener against itself.

**The Second Breaking Point:** If the canvas is absolutely positioned (like the `.app-header-canvas` with `width: 100%`), the browser's native `ResizeObserver` often does *not* trigger on the canvas itself when the parent container (the Toolbar) resizes. Because the element being observed (`me.id`) doesn't trigger, `manager.DomEvent` never routes a `resize` event back to the component, and the whole chain is dead.

## The Patch (Current State)
We temporarily patched this in `src/app/header/Canvas.mjs` by adding a `getObserverId()` method that returns `this.parentId` instead of `this.id`. However, this still requires manually adding `parent.addDomListeners({ resize: me.onToolbarResize })`, bypassing the `SharedCanvas` default setup entirely.

## The Goal
This ticket is to refactor the base `SharedCanvas` and `component/Canvas` to have a unified, clean architecture for resize tracking:
- Remove the `listeners: { resize: 'onResize' }` anti-pattern from `SharedCanvas`. It should instead override `onDomResize`.
- Allow configuration of *which* node triggers the component's size monitoring (e.g., observing a parent flex container when the canvas is absolutely positioned), so the base class `monitorSize` logic works reliably without manual `addDomListeners` workarounds in subclasses.

## Timeline

- 2026-02-26T19:31:24Z @tobiu assigned to @tobiu
- 2026-02-26T19:31:25Z @tobiu added the `ai` label
- 2026-02-26T19:31:26Z @tobiu added the `architecture` label

