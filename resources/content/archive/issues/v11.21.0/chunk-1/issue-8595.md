---
id: 8595
title: Investigate TreeList Chimera VDOM Corruption (Handover)
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-13T12:47:22Z'
updatedAt: '2026-01-13T13:08:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8595'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T13:08:00Z'
---
# Investigate TreeList Chimera VDOM Corruption (Handover)

**Current State:**
- **Fixed:** Sticky header behavior (missing styles in `expandParents`), horizontal scrolling (added `inline: 'start'`), header bold styling (SCSS), `getListItemsRoot` robustness.
- **Unresolved:** "Chimera" bug where a folder `LI` appears to merge with its children `UL` (the `UL` acquires the `LI`'s ID and styles, causing layout breakage).
- **Tested:** Unit tests (`TreeList.spec.mjs`, `TreeListRaceTest.spec.mjs`) confirm that standard expansion and store-update race conditions do **not** reproduce the Chimera structure in isolation.

**Hypothesis:**
The issue likely involves complex VDOM patching interactions or race conditions not yet simulated in unit tests, possibly involving `waitForDomRect` timing or multiple interleaved updates in the real App Worker environment.

**Next Steps for Investigation:**
1.  **Log App Worker Updates:** Instrument `Neo.currentWorker.promiseMessage` or `update()` in `src/tree/List.mjs` to log the exact VDOM structure being sent to the VDOM worker during the expansion sequence.
2.  **Log Main Thread Deltas:** Monitor the delta stream arriving at the Main Thread to see if the "Chimera" structure (UL with LI ID) is present in the applied deltas.
3.  **Neural Link Inspection:** Use the Neural Link tools (`inspect_component_render_tree`) in the next session to inspect the live application state when the bug occurs.
4.  **Review VDOM Engine:** If the App Worker sends correct VDOM but Main Thread applies Chimera, investigate `vdom.Helper` or `DomApi` patching logic for specific edge cases involving sibling tag changes or ID reuse (though improbable).

## Timeline

- 2026-01-13T12:47:23Z @tobiu added the `bug` label
- 2026-01-13T12:47:23Z @tobiu added the `ai` label
- 2026-01-13T12:47:36Z @tobiu assigned to @tobiu
- 2026-01-13T13:06:34Z @tobiu referenced in commit `294c372` - "fix: Assign deterministic IDs to TreeList UL containers to prevent Chimera VDOM corruption (#8595)"
### @tobiu - 2026-01-13T13:07:12Z

**Input from Gemini 3 Pro:**

> ✦ I have identified and fixed the root cause of the "Chimera" VDOM corruption.
> 
> **Root Cause Analysis:**
> The `UL` container used to group child items in `Neo.tree.List` was created without an explicit ID. This made it vulnerable during rapid state changes (e.g., expanding a folder while scrolling/loading).
> 1.  When a folder expands, the `UL` transitions from `removeDom: true` (hidden/filtered out) to `removeDom: false` (visible).
> 2.  In a race condition, the App Worker VDOM reflects the new state (visible `UL`), but an incoming VNode update from the VDOM Worker (based on the previous hidden state) aligns the `UL` in the local VDOM with the next `LI` in the incoming VNode.
> 3.  `Neo.util.VDom.syncVdomState` attempts to sync IDs. Since the `UL` had no ID, and the aligned `LI` node *did*, the utility erroneously copied the `LI`'s ID onto the `UL`.
> 4.  This resulted in a "Chimera" node: a `UL` tag bearing the ID of a sibling `LI`, causing stylesheets and logic to misidentify the container as an item.
> 
> **Fix:**
> I have modified `src/tree/List.mjs` to assign a deterministic ID (`parentId + '__ul'`) to every child container `UL`. This prevents `syncVdomState` from overwriting the ID during misalignment, effectively creating a shield against this class of race condition.
> 
> **Verification:**
> - Added a new test case in `test/playwright/unit/tree/ListRaceCondition.spec.mjs` verifying that `UL` containers now possess the correct, deterministic IDs.
> - Confirmed that standard expansion tests still pass.
> 
> The fix has been pushed to `dev`.

- 2026-01-13T13:08:00Z @tobiu closed this issue
- 2026-01-13T13:11:18Z @tobiu cross-referenced by #8596

