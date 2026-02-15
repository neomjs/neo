---
id: 9174
title: 'DevIndex: Reorder Grid Columns and Style Sponsors Heart'
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-02-15T18:26:24Z'
updatedAt: '2026-02-15T18:32:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9174'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T18:32:39Z'
---
# DevIndex: Reorder Grid Columns and Style Sponsors Heart

Two small but impactful UI/UX improvements:

1.  **Column Reordering:** Move the "Sponsors" column to appear *after* "Followers".
    *   **Reasoning:** Users scan left-to-right. Seeing "Followers" establishes social proof, and placing "Sponsors" immediately after creates a stronger call-to-action (CTA) gap, especially for users with high followers but low/zero sponsors.

2.  **Sponsors Icon Styling:** Color the heart icon red/pink to make it stand out.
    *   **Implementation:** Add a CSS rule in `apps/devindex/home/GridContainer.scss` targeting `.devindex-column-sponsors` to color the heart icon.

## Timeline

- 2026-02-15T18:26:25Z @tobiu added the `enhancement` label
- 2026-02-15T18:26:26Z @tobiu added the `ai` label
- 2026-02-15T18:32:17Z @tobiu referenced in commit `27ac9d0` - "style(devindex): Reorder columns and color Sponsors heart (#9174)

- Move 'Sponsors' column after 'Followers' for better UX flow.
- Style 'Sponsors' column heart icon with #ea4aaa (pink)."
- 2026-02-15T18:32:39Z @tobiu closed this issue

