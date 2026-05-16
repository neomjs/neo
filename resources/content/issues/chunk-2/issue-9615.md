---
id: 9615
title: 'Sub-Epic: Grid Multi-Body Stabilization (Header Sync & Pinning)'
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-31T19:38:39Z'
updatedAt: '2026-03-31T19:55:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9615'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T19:55:45Z'
---
# Sub-Epic: Grid Multi-Body Stabilization (Header Sync & Pinning)

This ticket tracks the stabilization of the Grid Multi-Body architecture prior to full CSS Variable-based horizontal scrolling implementation.

### Structural Stabilizations & Fixes:
- **Header Sync Restored:** Fixed the horizontal scroll wrapper sync logic so the header native `scrollLeft` updates seamlessly.
- **Pinning Fix:** Resolved a `TypeError` in `GridRowScrollPinning.mjs` by correctly parsing the new `bodyIds` array required for the multi-body setup.

### Modified Files:
- `src/grid/ScrollManager.mjs`: Adjusted Addons registration to pass the correct target wrappers (`bodyIds`) and isolate `--grid-scroll-left` injection.
- `src/main/addon/GridHorizontalScrollSync.mjs`: Main Thread synchronous injection of the custom CSS property onto the inner body, preserving JS thread limits.
- `src/main/addon/GridRowScrollPinning.mjs`: Updated to natively support multiple body zones via the `bodyIds` array.
- `resources/scss/src/grid/Body.scss`: `overflow-x` set to hidden to maintain container boundaries.
- `resources/scss/src/grid/HorizontalScrollbar.scss`: Structural adjustments (`flex: none`, explicit constraints) to prevent flex collapsing under the new wrapper structure.

## Timeline

- 2026-03-31T19:38:41Z @tobiu added the `bug` label
- 2026-03-31T19:38:41Z @tobiu added the `ai` label
- 2026-03-31T19:38:41Z @tobiu added the `grid` label
- 2026-03-31T19:39:24Z @tobiu referenced in commit `e67abc3` - "fix: Grid Multi-Body Stabilization (Header Sync & Pinning) (#9615)"
### @tobiu - 2026-03-31T19:39:35Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Stabilized baseline state committed and pushed. This commit serves as a structural backup before implementing the CSS var based horizontal scrolling algorithm inside `Body.mjs`.
> 
> - Reverted partial horizontal scroll sync changes.
> - Fixed `bodyIds` reference in `ScrollManager.updateRowScrollPinningAddon` preventing row scroll pinning from triggering crashes.

- 2026-03-31T19:42:45Z @tobiu assigned to @tobiu
- 2026-03-31T19:55:45Z @tobiu closed this issue
- 2026-03-31T20:21:54Z @tobiu added parent issue #9486

