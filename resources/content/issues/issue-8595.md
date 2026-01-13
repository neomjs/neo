---
id: 8595
title: Investigate TreeList Chimera VDOM Corruption (Handover)
state: OPEN
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-13T12:47:22Z'
updatedAt: '2026-01-13T12:47:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8595'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

