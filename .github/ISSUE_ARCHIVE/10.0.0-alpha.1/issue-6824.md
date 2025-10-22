---
id: 6824
title: Neo.main.mixin.DeltaUpdates => Neo.main.DeltaUpdates
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-17T05:36:11Z'
updatedAt: '2025-06-17T09:27:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6824'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-17T09:27:05Z'
---
# Neo.main.mixin.DeltaUpdates => Neo.main.DeltaUpdates

**Reported by:** @tobiu on 2025-06-17

* I want to refactor this one from a mixin to a singleton
* While the class has no remote method access, a dedicated file feels cleaner

## Comments

### @tobiu - 2025-06-17 05:40

Gemini:

I understand your thoughts on the Neo.main.mixin.DeltaUpdates module, especially concerning its transition to a singleton and the orchestration with requestAnimationFrame in Neo.Main.

Your observation is accurate: Neo.Main does indeed pipe specific DOM operation methods through requestAnimationFrame queues (readQueue, updateQueue, writeQueue). This is a crucial design choice for visual consistency and performance in a VDOM-driven framework.

Why requestAnimationFrame for DOM Updates?
requestAnimationFrame ensures that DOM manipulations (like creating, updating, or removing elements) are batched and executed just before the browser's next repaint cycle. This prevents visual tearing, layout thrashing, and ensures the UI updates smoothly and efficiently, synchronized with the browser's rendering pipeline. This mechanism is specifically for operations that affect the visual layout or content of the page based on VDOM changes.

Distinguishing Method Types in Neo.Main
It's important to distinguish between the types of methods Neo.Main handles:

VDOM-Driven DOM Mutations: Methods like those that would belong to Neo.main.DeltaUpdates (e.g., du_moveNode, createDomTree methods, du_insertNode, du_removeNode) are precisely the operations that must go through the requestAnimationFrame queues. They directly alter the page's visual state based on VDOM deltas. Neo.Main's onMountDom, onRender, and onUpdateDom events (triggered by the VDOM worker) all enqueue these operations into writeQueue or updateQueue, which are then processed by renderFrame within requestAnimationFrame.

Direct Browser API Calls / Utilities: Methods like alert(), redirectTo(), log(), getByPath(), getWindowData(), importAddon(), or windowClose() do not affect the DOM in a way that requires tight synchronization with rendering frames (or they trigger their own, isolated browser-managed operations). They are direct utility calls or interactions with browser APIs. These methods do not need to be queued via requestAnimationFrame because they are not part of the VDOM reconciliation and rendering cycle.

Singleton vs. Mixin & requestAnimationFrame
Your original reason for making DeltaUpdates a mixin (no remote access, excitement about mixins) might have influenced the initial design. However, the decision to queue VDOM operations via requestAnimationFrame was fundamentally driven by Neo.Main's queueRead, queueUpdate, queueWrite, and processQueue methods. These are the orchestrators that pull operations from the queues and execute them at the appropriate time.

Transitioning Neo.main.mixin.DeltaUpdates to a singleton (named Neo.main.DeltaUpdates) will not break this requestAnimationFrame piping.

The methods that perform DOM manipulations (e.g., du_insertNode, du_moveNode, createDomTree's logic) will continue to be called by Neo.Main's processQueue loop.
The change simply clarifies ownership: instead of being mixed into Neo.Main, these core DOM update methods reside on their own dedicated singleton.
Conclusion
Making Neo.main.DeltaUpdates a singleton is an excellent architectural choice. It enhances modularity and clarity by assigning a single, authoritative entity to manage the application of VDOM deltas to the DOM. The critical requestAnimationFrame synchronization remains firmly in the hands of Neo.Main's queue management system, which will continue to ensure all VDOM-driven DOM operations are performed efficiently and visually smoothly. This separation of concerns is a robust design pattern.

