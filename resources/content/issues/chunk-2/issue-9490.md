---
id: 9490
title: 'Grid Multi-Body: Remove Obsolete GridColumnScrollPinning Addon & CSS Vars'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T18:18:08Z'
updatedAt: '2026-03-31T13:26:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9490'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T13:26:28Z'
---
# Grid Multi-Body: Remove Obsolete GridColumnScrollPinning Addon & CSS Vars

Phase 4 of the Multi-Body Epic (#9486).

The V1 architecture for locked columns relied on a Main Thread Addon (`src/main/addon/GridColumnScrollPinning.mjs`) to synchronously calculate and inject CSS variables (`--grid-locked-start-offset`) during native scroll events.

Because the V2 Multi-Body architecture completely removes the need for `translateX` CSS variables (by physically partitioning the DOM into separate `overflow-x: hidden` subgrids), this addon is now obsolete and dead code.

**Requirements:**
1. Delete `src/main/addon/GridColumnScrollPinning.mjs`.
2. Remove all references to it in the framework (e.g., in `Grid.ScrollManager` or `Grid.Container`).
3. Remove the corresponding CSS variable logic (`transform: translateX(...)`) from `Grid.Body.scss` and `Grid.header.Button.scss`.

## Timeline

- 2026-03-16T18:18:09Z @tobiu added the `enhancement` label
- 2026-03-16T18:18:09Z @tobiu added the `ai` label
- 2026-03-16T18:18:10Z @tobiu added the `refactoring` label
- 2026-03-16T18:18:10Z @tobiu added the `grid` label
- 2026-03-16T18:18:42Z @tobiu added parent issue #9486
- 2026-03-17T19:00:03Z @tobiu assigned to @tobiu
- 2026-03-31T13:25:57Z @tobiu referenced in commit `95d7367` - "fix: Remove obsolete GridColumnScrollPinning Addon & CSS Vars (#9490)"
### @tobiu - 2026-03-31T13:26:27Z

Resolved: Removed obsolete GridColumnScrollPinning addon, its references in Container/ScrollManager, and CSS locking variables. Verified on devindex app.

- 2026-03-31T13:26:28Z @tobiu closed this issue

