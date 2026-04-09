---
id: 9819
title: 'R&D: Identify Ideal Candidates for Whitebox E2E Testing'
state: OPEN
labels:
  - enhancement
  - ai
  - testing
assignees: []
createdAt: '2026-04-09T11:33:45Z'
updatedAt: '2026-04-09T11:33:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9819'
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
# R&D: Identify Ideal Candidates for Whitebox E2E Testing

### Background
The initial integration of Neural Link with Playwright for whitebox E2E testing attempted to use the `DevIndex` application, driving mutations into complex grid layouts (like modifying a grid header button's width directly). This highlighted that monolithic, highly state-managed applications are tough first targets for proving Neural Link's baseline test primitives.

### Objective
- Identify the most minimal, stable Neo.mjs applications or standalone components (e.g., specific `examples/` apps) that are ideal candidates for initial Neural Link test integration.
- Prove the test architecture on basic inputs/outputs (like standalone generic buttons or primitive windows) prior to moving testing over to nested container layouts.

## Timeline

- 2026-04-09T11:33:46Z @tobiu added the `enhancement` label
- 2026-04-09T11:33:46Z @tobiu added the `ai` label
- 2026-04-09T11:33:46Z @tobiu added the `testing` label
- 2026-04-09T11:34:01Z @tobiu marked this issue as blocking #8851

