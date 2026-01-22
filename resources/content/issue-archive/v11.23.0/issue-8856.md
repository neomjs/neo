---
id: 8856
title: Implement Spatial Theme Transition (The Wave)
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-21T20:02:50Z'
updatedAt: '2026-01-21T20:33:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8856'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T20:33:20Z'
---
# Implement Spatial Theme Transition (The Wave)

- **Goal:** Implement a "Spatial Theme Switch" using the **View Transitions API**.
- **Concept:** "The Wave". Instead of an instant flash or a generic fade, the new theme should ripple out from the user's interaction point (the Theme Switch button).
- **Tech Stack:**
    - `document.startViewTransition()`
    - CSS `clip-path` animation on the `::view-transition-new(root)` pseudo-element.
- **Why:**
    - Reinforces the "Engine" feel.
    - Eliminates the "Flashbang" effect of instant switching.
    - Extremely performant (Compositor-only animation).
- **Fallback:** Instant switch for browsers lacking support.

## Implementation Steps
1.  **Controller Update:** Modify `apps/portal/view/ViewportController.mjs`.
    -   Wrap the `setTheme` call in `document.startViewTransition`.
    -   Capture click coordinates (`clientX`, `clientY`) from the button event.
    -   Inject the animation logic into `transition.ready`.
2.  **CSS:** Add basic View Transition rules to `resources/scss/src/apps/portal/Viewport.scss` (disable default cross-fade to allow custom clip-path).


## Timeline

- 2026-01-21T20:02:52Z @tobiu added the `enhancement` label
- 2026-01-21T20:02:52Z @tobiu added the `design` label
- 2026-01-21T20:02:52Z @tobiu added the `ai` label
- 2026-01-21T20:33:02Z @tobiu referenced in commit `f525d56` - "feat: Implement Spatial Theme Transition (The Wave) (#8856)"
- 2026-01-21T20:33:20Z @tobiu closed this issue
- 2026-01-21T20:33:23Z @tobiu assigned to @tobiu

