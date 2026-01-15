---
id: 8678
title: Implement Hero Container Wrapper
state: OPEN
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-15T03:29:32Z'
updatedAt: '2026-01-15T03:29:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8678'
author: tobiu
commentsCount: 0
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Hero Container Wrapper

## Objective
Fix the "Sticky Canvas" issue where the Home Canvas remains fixed on screen while scrolling down to other sections.

## Tasks
1.  **Wrapper Component:** Create `Portal.view.home.HeroContainer` (or similar).
2.  **Composition:** Move `HomeCanvas` and `MainNeo` inside this container.
3.  **Positioning:** Ensure the Canvas is `absolute` positioned *within* the Container, not `fixed` to the viewport.
4.  **Lifecycle Verification:** Verify that scrolling the Hero out of view triggers `pause()`, and scrolling back triggers `resume()`. This effectively tests the visibility observer.

## Timeline

- 2026-01-15T03:29:32Z @tobiu assigned to @tobiu
- 2026-01-15T03:29:34Z @tobiu added the `bug` label
- 2026-01-15T03:29:34Z @tobiu added the `ai` label
- 2026-01-15T03:29:34Z @tobiu added the `architecture` label
- 2026-01-15T03:29:46Z @tobiu added parent issue #8661

