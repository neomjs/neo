---
id: 8476
title: Refactor Gallery to remove manual afterSetId ID assignment
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T17:07:08Z'
updatedAt: '2026-01-09T17:10:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8476'
author: tobiu
commentsCount: 1
parentIssue: 8469
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T17:10:36Z'
---
# Refactor Gallery to remove manual afterSetId ID assignment

**Context:**
`src/component/Gallery.mjs` implements `afterSetId` to manually assign IDs to its internal VDOM structure (`origin`, `camera`, `dolly`, `view`).
```javascript
    afterSetId(value, oldValue) {
        super.afterSetId(value, oldValue);

        let me     = this,
            origin = me.vdom.cn[0],
            camera = origin.cn[0],
            dolly  = camera.cn[0],
            view   = dolly.cn[0],
            prefix = me.id + '__';

        camera.id = prefix + 'camera';
        dolly .id = prefix + 'dolly';
        origin.id = prefix + 'origin';
        view  .id = prefix + 'view';

        me.update()
    }
```
This manual assignment is a pattern we are moving away from in favor of declarative ID management or relying on the framework's stability mechanisms where possible.
However, `Gallery.mjs` is a complex component with 3D transforms (`dolly`, `camera`) and DOM reading logic that might rely on these specific IDs.

**Analysis:**
- `onSelectionChange` uses `id + '__dolly'` to apply transforms and read computed styles.
- `createItem` uses `getItemVnodeId` (`this.id + '__' + id`) to assign IDs to items.
- If we remove `afterSetId`, we must ensure that these nodes still get these IDs, or we must update the logic that consumes them.

**Proposal:**
We cannot simply delete it without breaking `onSelectionChange` which does `Neo.currentWorker.promiseMessage('main', { action: 'updateDom', ... id: id + '__dolly' ... })`.
The 3D gallery relies on direct DOM manipulation via these specific IDs.

**Strategy:**
1.  **Safety Check:** `ensureStableIds` (in `VdomLifecycle`) only handles the root and wrapper. It does *not* handle deep internal nodes like `camera`, `dolly`, etc.
2.  **Refactoring:** We can move this logic to a more appropriate place, or keep it if it's strictly necessary for the component's internal mechanics.
    However, since `afterSetId` runs *before* `initConfig` (due to the `construct` sequence), this is another potential prototype pollution vector if not for our recent `construct` fix in `Base.mjs`.
    With the `construct` fix, `this.vdom` is safe.
    But is it "clean" to have this here?
    Since `Gallery` has a fixed VDOM structure defined in `_vdom`, these IDs are structural.
3.  **Alternative:** We can define these IDs dynamically in `getVdomRoot`? No, they are deep children.
4.  **Best Approach:** Keep the logic but ensure it uses the safe instance VDOM.
    Wait, the user asked to **remove it**.
    "goal => remove it".
    If we remove it, we must ensure the nodes *still* get the IDs, OR update the code to find them differently (e.g. by reference).
    But `promiseMessage` requires an ID string.
    So the nodes **must** have IDs.
    
    Can we assign them in `construct`? `construct` calls `super.construct` which calls `afterSetId`.
    If we remove `afterSetId`, they won't get IDs on creation.
    
    Can we use `onConstructed`?
    `onConstructed` runs *after* `initConfig`. This is a safer place for one-time setup.
    BUT, `id` can change at runtime. `afterSetId` handles runtime changes.
    
    If we remove `afterSetId`, we break runtime ID changes (rare, but supported).
    
    **Maybe we don't need to assign them to the VDOM at all?**
    If we don't assign `id` to `dolly` in VDOM, it won't have an ID in the DOM.
    Then `promiseMessage(..., {id: id + '__dolly'})` will fail to find the node.
    
    So the nodes **must** have IDs in the DOM.
    
    **User's Goal:** "remove it".
    This implies there might be a way to avoid manual ID assignment.
    Does the framework auto-assign IDs to children? No.
    
    Perhaps the user implies we should move this logic to a better place or rely on something else?
    Or maybe `Gallery` shouldn't be using hardcoded ID lookups?
    
    If I look at `onSelectionChange`, it does `Neo.currentWorker.promiseMessage`. This is low-level DOM access.
    
    If I simply remove `afterSetId`, the Gallery will break.
    Therefore, I must replace it with something equivalent but cleaner, OR prove it's not needed.
    
    **Hypothesis:** The user might be thinking about `ensureStableIds` covering this, but `ensureStableIds` only covers the wrapper.
    
    Let's look at `createItem`. It uses `getItemVnodeId`.
    
    **Decision:** I will create a test to see if it breaks.
    If I remove it, and the test fails (can't find node), then I know.
    
    **Test Plan:**
    1. Create a Gallery.
    2. Check if `#my-gallery__dolly` exists in the VDOM.
    3. If it exists *with* `afterSetId` and fails *without*, then removing it is a breaking change unless we fix the dependency.
    
    I suspect the "goal => remove it" implies we should refactor the code that *needs* these IDs to find the nodes differently, or use `vdom.cn[0].cn[0]...`?
    But `promiseMessage` crosses threads. It needs an ID.
    
    Maybe we can use `vnode` finding? `VNodeUtil.find(this.vnode, ...)`?
    If we find the node in VNode tree, we can get its ID.
    But if the ID wasn't assigned in VDOM, the DOM node won't have one (or will have an auto-generated one).
    Auto-generated IDs are unstable. `promiseMessage` needs a stable ID to target the exact node.
    
    **Conclusion:** The nodes need stable IDs.
    If we remove `afterSetId`, we must assign them elsewhere.
    `updateVdom`? `onConstructed`?
    
    Actually, `src/component/Base.mjs` `construct` now clones the VDOM eagerly.
    So `afterSetId` is safe from pollution.
    But is it "good code"?
    
    Maybe the user wants us to use `onConstructed`?
    Or maybe `createVdomReference`?
    
    Let's assume the goal is to remove the *manual string concatenation* pattern in `afterSetId`.
    
    I will create the test first to confirm the current behavior.

## Timeline

- 2026-01-09T17:07:10Z @tobiu added the `ai` label
- 2026-01-09T17:07:10Z @tobiu added the `refactoring` label
- 2026-01-09T17:07:10Z @tobiu added the `core` label
- 2026-01-09T17:07:16Z @tobiu added parent issue #8469
- 2026-01-09T17:09:25Z @tobiu referenced in commit `c4c89ce` - "refactor: replace afterSetId with ensureStableIds in Gallery to verify structural integrity before removal (#8476)"
- 2026-01-09T17:09:53Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T17:10:19Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `src/component/Gallery.mjs` to use `ensureStableIds` instead of `afterSetId`.
> 
> **Changes:**
> - Replaced `afterSetId` with `ensureStableIds` override.
> - This maintains the current behavior (stable IDs on internal nodes) but aligns with the new architectural pattern.
> 
> **Next Steps (as per latest instruction):**
> - The ultimate goal is to **remove ID assignment completely**.
> - This requires refactoring `onSelectionChange` (which relies on `id + '__dolly'`) and `createItem` (which relies on `getItemVnodeId`) to work without hardcoded ID lookups.
> - I will proceed with this deeper refactoring in the next steps.
> 
> Commit: c4c89ce31 (#8476)

- 2026-01-09T17:10:36Z @tobiu closed this issue

