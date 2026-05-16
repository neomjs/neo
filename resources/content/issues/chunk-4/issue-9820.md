---
id: 9820
title: 'R&D: Grid Component Mutability & Column Synchronization'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees: []
createdAt: '2026-04-09T11:33:52Z'
updatedAt: '2026-04-09T11:33:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9820'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[x] 8851 Exploration: Neural Link Driven Playwright Tests (Deep E2E)'
---
# R&D: Grid Component Mutability & Column Synchronization

### Background
During whitebox E2E testing, we discovered that explicitly mutating a Grid Header Button's `width` via Neural Link successfully updates the resulting VNode component state, but fails to update the physical layout because the wider grid `columns` collection and flex layouts override the child node's inline specification.

### Objective
- Research whether targeting and altering raw child grid components (e.g. `header.Button`) should technically ripple up and update structural `columns` or `columnPositions`, adjusting the container's layout metrics.
- Should this be disallowed semantically (requiring column mutations to go through grid container methods natively)? Outline the expected domain boundary for E2E testing.

## Timeline

- 2026-04-09T11:33:53Z @tobiu added the `enhancement` label
- 2026-04-09T11:33:54Z @tobiu added the `ai` label
- 2026-04-09T11:33:54Z @tobiu added the `architecture` label
- 2026-04-09T11:33:54Z @tobiu added the `grid` label
- 2026-04-09T11:34:02Z @tobiu marked this issue as blocking #8851

