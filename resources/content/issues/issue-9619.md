---
id: 9619
title: 'Grid Multi-Body: Implement and Test Locked Columns in DevIndex'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-04-01T17:27:49Z'
updatedAt: '2026-04-01T17:28:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9619'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Implement and Test Locked Columns in DevIndex

### Goal
Convert specific columns in the DevIndex application Grid to be locked to the start and end edges, to validate the new multi-body horizontal scroll architecture with locked columns.

### Context
This is a follow-up to the horizontal scroll synchronization implementation (Issue #9616). Currently, we have not tested how exactly the new architecture processes and aligns `.neo-locked-start` and `.neo-locked-end` cells dynamically against non-locked cells. Applying this inside the DevIndex testing grounds will expose any remaining logical gaps.

### Implementation Plan
1. **Modify DevIndex GridContainer:** Configure the first 3 columns (`#`, `Rank`, `User`) to explicitly use `locked: 'start'`.
2. **Modify DevIndex GridContainer:** Configure the last column (`Updated`) to use `locked: 'end'`.
3. **Verify Layout & SCSS Adjustments:** Ensure the locked columns visually dock correctly while allowing center columns to continuously translate via the `--grid-scroll-left` native variable.
4. **Update Playwright E2E Tests:** Expand assertions to measure physical locked bounds alongside free-scrolling center bounds.

## Timeline

- 2026-04-01T17:27:50Z @tobiu added the `enhancement` label
- 2026-04-01T17:27:50Z @tobiu added the `ai` label
- 2026-04-01T17:27:50Z @tobiu added the `grid` label
- 2026-04-01T17:27:58Z @tobiu added parent issue #9486
- 2026-04-01T17:28:07Z @tobiu assigned to @tobiu

