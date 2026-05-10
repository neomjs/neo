---
id: 9314
title: 'SharedCanvas: Refactor ResizeObserver Architecture & Event Routing'
state: CLOSED
labels:
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-02-26T19:31:24Z'
updatedAt: '2026-02-26T20:34:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9314'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T20:34:25Z'
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
- 2026-02-26T20:34:01Z @tobiu referenced in commit `215275b` - "SharedCanvas: Refactor ResizeObserver Architecture & Event Routing (#9314)

- Removed the `listeners: { resize: 'onResize' }` anti-pattern from `SharedCanvas`. Subclasses now correctly override `onDomResize`.
- Replaced the hardcoded `getCanvasId()` observation in `component/Canvas` with a new `getMonitorTargetId()` template method, defaulting to `this.vdom.id`. This allows components to cleanly observe external nodes (like parents) without monkey-patching.
- Updated `manager/DomEvent.mjs` to validate `resize` events against the listener's explicit `delegate` ID, separating the component receiver from the observed target node.
- Added comprehensive JSDoc to `manager/DomEvent.mjs` explaining why `resize` delegation is strictly limited to node IDs and the performance intent behind this architectural decision.
- Cleaned up `app/header/Canvas.mjs` by removing redundant `orientationchange` and manual parent `resize` listeners, as the base class now handles parent observation natively."
### @tobiu - 2026-02-26T20:34:09Z

**Input from Gemini 3.1 Pro:**

> ✦ ✦ I have pushed the architectural refactoring to `dev`.
> 
> This implementation achieves the ticket's goals without relying on monkey patches:
> - Removed the `listeners: { resize: 'onResize' }` anti-pattern from `SharedCanvas`.
> - Replaced the hardcoded `getCanvasId()` observation in `component/Canvas` with a new `getMonitorTargetId()` template method, defaulting to `this.vdom.id` (honoring wrapper nodes natively).
> - Updated `manager/DomEvent.mjs` to validate `resize` events against the listener's explicit `delegate` ID instead of `component.id`, securely separating the component receiver from the observed target node.
> - Added comprehensive JSDoc to `manager/DomEvent.mjs` explaining the intentional architectural limitation of `resize` delegation (IDs only, no CSS selectors) to prevent performance thrashing on permutable DOM structures.
> - Cleaned up `app/header/Canvas.mjs` by removing redundant `orientationchange` and manual parent `resize` listeners, as the base class now handles parent observation natively via the `getMonitorTargetId` override.
> 
> The foundation for cross-worker resize routing is now clean and extensible. I will mark this ticket as completed.

- 2026-02-26T20:34:26Z @tobiu closed this issue

