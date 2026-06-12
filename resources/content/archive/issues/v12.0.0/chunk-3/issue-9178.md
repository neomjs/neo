---
id: 9178
title: 'DevIndex: Add ''Impact'' Column (Heuristics Visualization)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-15T21:32:38Z'
updatedAt: '2026-02-15T21:52:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9178'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T21:52:19Z'
---
# DevIndex: Add 'Impact' Column (Heuristics Visualization)

1.  Create `apps/devindex/view/grid/column/Heuristics.mjs` component.
    -   Visualizes Velocity (`v`), Acceleration (`a`), and Consistency (`c`) metrics.
    -   Uses "Badge" metaphor:
        -   Velocity: ⚡ (Fast), 🔥 (On Fire)
        -   Acceleration: 📈 (Rising), 🚀 (Explosive)
        -   Consistency: 🛡️ (Veteran), 🏛️ (Pillar)
    -   Empty state: 🌱 (Seedling)
2.  Integrate into `DevIndex.view.home.GridContainer` as "Impact" column.
    -   Uses the new component.
    -   Maps to `heuristics` (`hm`) field.


## Timeline

- 2026-02-15T21:32:39Z @tobiu added the `enhancement` label
- 2026-02-15T21:32:39Z @tobiu added the `ai` label
- 2026-02-15T21:51:35Z @tobiu referenced in commit `cf19f44` - "feat(devindex): Add Impact column with Heuristics visualization (#9178)"
### @tobiu - 2026-02-15T21:51:44Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Impact" column using the new `Heuristics` component.
> 
> 1.  **Component:** Created `apps/devindex/view/home/component/Heuristics.mjs`.
>     -   Uses a **stable VDOM pool** (3 pre-allocated nodes) to ensure zero DOM thrashing during grid scrolling.
>     -   Implements the "Badge" system with prefixes for clarity (e.g., "Acceleration: Explosive Growth").
>     -   Zero State logic: Only shows "New Contributor" seedling for `c <= 1`.
> 2.  **Styles:** Created `resources/scss/src/apps/devindex/home/component/Heuristics.scss` with `contain: layout paint style` for performance.
> 3.  **Grid Integration:** Added the column to `GridContainer.mjs` using the functional `component` config pattern to map `record.heuristics` dynamically.
> 
> The changes are committed and pushed to `dev`.

- 2026-02-15T21:51:53Z @tobiu added parent issue #9106
- 2026-02-15T21:51:58Z @tobiu assigned to @tobiu
- 2026-02-15T21:52:19Z @tobiu closed this issue

