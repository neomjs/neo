---
id: 9465
title: 'TreeGrid Big Data Demo: Styling, Logging, and Final Integration'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T11:07:50Z'
updatedAt: '2026-03-13T12:03:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9465'
author: tobiu
commentsCount: 2
parentIssue: 9461
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-13T12:03:04Z'
---
# TreeGrid Big Data Demo: Styling, Logging, and Final Integration

### Goal
Finalize the TreeGrid Big Data demo by integrating styling, ensuring performance metrics are visible, and wrapping up the demo for inclusion in the Portal / build system.

### Tasks
1.  **Styling**: Copy or adapt necessary SCSS from the `bigData` demo (`apps/portal/resources/scss/src/examples/grid/bigData.scss`) for the new `treeBigData` layout, ensuring it looks polished in both light and dark themes.
2.  **Performance Logging**: Ensure the `ControlsContainer` and `MainStore` log the time taken for data generation, collection addition, and grid rendering (similar to the big data demo) to prove the "Turbo Mode" efficacy.
3.  **Documentation**: Add the new example to `docs/examples.json` so it appears in the documentation portal.
4.  **Final Polish**: Verify selection models work as expected across the tree columns.

## Timeline

- 2026-03-13T11:07:50Z @tobiu added the `enhancement` label
- 2026-03-13T11:07:51Z @tobiu added the `ai` label
- 2026-03-13T11:07:51Z @tobiu added the `grid` label
- 2026-03-13T11:08:01Z @tobiu assigned to @tobiu
- 2026-03-13T11:08:05Z @tobiu added parent issue #9461
### @tobiu - 2026-03-13T11:52:19Z

Added example to docs/examples.json via commit 3d0032f62.

### @tobiu - 2026-03-13T12:02:30Z

Fixed MainModel array replacement issue to preserve TreeModel inherited fields.

- 2026-03-13T12:03:04Z @tobiu closed this issue

