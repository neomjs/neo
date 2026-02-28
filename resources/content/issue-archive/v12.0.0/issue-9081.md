---
id: 9081
title: 'Feat: DevRank Global Animation Toggle'
state: CLOSED
labels:
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-02-10T02:29:50Z'
updatedAt: '2026-02-10T03:31:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9081'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T03:31:56Z'
---
# Feat: DevRank Global Animation Toggle

Implement a "Show Animations" toggle to allow users to disable pulse and scroll animations for accessibility and performance on low-end devices.

**Requirements:**
1.  **ControlsContainer:** Add a "Show Animations" CheckBox (checked by default).
2.  **GridContainer:** Add `animateVisuals_` config.
    -   Update `HeaderToolbar.headerCanvas.timeScale`.
    -   Update `Body` rows.
3.  **GridRow:** Implement `updateCellComponents(identifier, config)` helper.
    -   Iterate `this.components`.
    -   Match against `identifier` (ntype/Class).
    -   Apply `config` to matches.
4.  **GridBody:** On `animateVisuals` change, call `row.updateCellComponents('sparkline', {usePulse: value})` for all rows.


## Timeline

- 2026-02-10T02:29:51Z @tobiu added the `ai` label
- 2026-02-10T02:29:51Z @tobiu added the `feature` label
- 2026-02-10T02:30:02Z @tobiu added parent issue #8930
- 2026-02-10T02:30:11Z @tobiu assigned to @tobiu
- 2026-02-10T03:30:59Z @tobiu referenced in commit `1b79d6f` - "Feat: DevRank Global Animation Toggle (#9081)"
### @tobiu - 2026-02-10T03:31:19Z

**Input from Gemini 3 Pro:**

> ✦ Task completed.
> 
> ### Implemented Features
> 1.  **Global Animation Toggle:** Added a "Show Animations" CheckBox to the DevRank controls (default: true).
> 2.  **Architecture:**
>     *   **ControlsContainer:** Updates `GridContainer.animateVisuals`.
>     *   **GridContainer:** Fires `animateVisualsChange`.
>     *   **ViewportController:** Subscribes to the event and updates the App Header Canvas.
>     *   **GridBody:** Propagates `usePulse` state to all managed Sparkline components via `Row.updateCellComponents`.
> 3.  **Sparkline Updates:**
>     *   Added `updateCellComponents` to `Neo.grid.Row` for bulk-updating managed components by type.
>     *   Updated `Sparkline.mjs` (Renderer) to cleanly remove artifacts when animations are disabled.
> 4.  **Header Canvas Updates:**
>     *   Added `usePulse` support.
>     *   Implemented "Reduced Motion" mode: When animations are disabled, the header drifts at 0.2x speed instead of freezing, avoiding a broken appearance.
>     *   Disabled the "Show Off" scroll acceleration and white-hot overlay when animations are disabled.
> 
> ### Outcome
> Users can now toggle high-performance animations off for a calmer experience or to support low-end devices/accessibility needs, without breaking the visual coherence of the application.
> 

- 2026-02-10T03:31:57Z @tobiu closed this issue

